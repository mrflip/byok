#!/usr/bin/env bash
# Survey the local branches and worktrees for /branch-sweep. Read-only: it fetches, and it reads
# git and GitHub, but it moves no ref, writes no tag and removes nothing.
#
# Usage: survey.sh [repo]    (default: the current directory's repository)
#
# Prints tab-separated rows, one per local branch, then one per worktree:
#
#   branch  <verdict>  <branch>  <local sha>  <target sha|->  <pr|->  <worktree|->  <reason>
#   tree    <verdict>  <path>    <branch>     <reason>
#   remote  <count>    <what is counted>
#
# Branch verdicts:
#   close   certain it is finished: tag closed/<branch> at <local sha>, then point it at <target>
#   done    already swept: closed/<branch> exists and the branch sits on its target
#   active  likely in progress: an open PR, or a worktree, or a fresh branch with no PR yet
#   weird   none of the above; <reason> says what does not fit
# Tree verdicts:
#   remove  its branch is `close`, and nothing in it could be lost or is in use
#   keep    anything else; <reason> says why

set -euo pipefail

repo=${1:-.}
cd "$repo"
git rev-parse --git-dir > /dev/null

main_ref=origin/main
fresh_secs=$((60 * 60))      # a branch moved this recently, with no PR, is someone's new thread
recent_mins=30               # a worktree file touched this recently means someone is in it
min_subject=30               # shorter subjects are too generic to match on alone
junk_re='(^|/)(\.DS_Store|\.eslintcache|[^/]*\.tsbuildinfo)$'

git fetch --quiet --prune origin

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

gh pr list --state all --limit 1000 \
  --json number,state,headRefName,headRefOid,baseRefName,mergedAt > "$scratch/prs.json"
git log --no-merges --format='%H%x09%s' "$main_ref" > "$scratch/main-subjects.tsv"

# path<TAB>branch for each worktree but the main checkout
git worktree list --porcelain | awk '
  /^worktree /  { path = substr($0, 10) }
  /^branch /    { sub("refs/heads/", "", $2); branch[path] = $2 }
  /^detached/   { branch[path] = "(detached)" }
  /^$/          { if (path != "" && seen++) { print path "\t" branch[path] } ; path = "" }
  END           { if (path != "" && seen++) { print path "\t" branch[path] } }
' > "$scratch/worktrees.tsv"

now=$(date +%s)

worktree_of() {
  awk -F'\t' -v br="$1" '$2 == br { print $1 }' "$scratch/worktrees.tsv"
}

prs_for() {
  jq -r --arg br "$1" '[.[] | select(.headRefName == $br)] | sort_by(.number) | reverse | .[]
    | [.number, .state, .headRefOid, .baseRefName] | @tsv' "$scratch/prs.json"
}

# The main commit a branch commit corresponds to: itself; else, among main's commits with the same
# subject, a patch-equivalent one, or the newest when the subject is long enough to be telling.
main_match() {
  local commit=$1 subject patch candidate candidates
  if git merge-base --is-ancestor "$commit" "$main_ref"; then
    echo "$commit"
    return
  fi
  subject=$(git log -1 --format=%s "$commit")
  candidates=$(awk -F'\t' -v subj="$subject" '$2 == subj { print $1 }' "$scratch/main-subjects.tsv")
  if [[ -z "$candidates" ]]; then
    return
  fi
  patch=$(git show "$commit" | git patch-id --stable | cut -d' ' -f1)
  for candidate in $candidates; do
    if [[ "$(git show "$candidate" | git patch-id --stable | cut -d' ' -f1)" == "$patch" ]]; then
      echo "$candidate"
      return
    fi
  done
  if (( ${#subject} >= min_subject )); then
    head -1 <<< "$candidates"
  fi
}

# The branch's commits that main lacks by SHA and by patch (`git cherry`'s +), and whose subject
# is not on main either.
unmatched_commits() {
  local branch=$1 mark commit
  while read -r mark commit; do
    if [[ "$mark" == + && -z "$(main_match "$commit")" ]]; then
      git log -1 --format='%h %s' "$commit"
    fi
  done < <(git cherry "$main_ref" "$branch")
}

commits() {
  if (( $1 == 1 )); then echo "1 commit"; else echo "$1 commits"; fi
}

row() {
  printf 'branch\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@"
}

declare -A branch_verdict

survey_branch() {
  local branch=$1 local_sha wt tag_sha prs open merged closed_prs target pr reason
  local_sha=$(git rev-parse "refs/heads/$branch")
  wt=$(worktree_of "$branch")
  tag_sha=$(git rev-parse -q --verify "refs/tags/closed/$branch^{commit}" || true)
  prs=$(prs_for "$branch")
  open=$(awk -F'\t' '$2 == "OPEN"' <<< "$prs" | head -1)
  merged=$(awk -F'\t' '$2 == "MERGED" && $4 == "main"' <<< "$prs" | head -1)
  closed_prs=$(awk -F'\t' '$2 == "CLOSED" || ($2 == "MERGED" && $4 != "main") { printf "#%s(%s into %s) ", $1, $2, $4 }' <<< "$prs")

  if [[ -n "$open" ]]; then
    pr=$(cut -f1 <<< "$open")
    reason="open PR"
    if [[ "$(cut -f3 <<< "$open")" != "$local_sha" ]]; then
      reason="open PR; local differs from the PR's head $(cut -c1-7 <<< "$(cut -f3 <<< "$open")")"
    fi
    branch_verdict[$branch]=active
    row active "$branch" "${local_sha:0:7}" - "#$pr" "${wt:--}" "$reason"
    return
  fi

  if [[ -n "$merged" ]]; then
    pr="#$(cut -f1 <<< "$merged")"
    target=$(cut -f3 <<< "$merged")
    if ! git merge-base --is-ancestor "$target" "$main_ref" 2> /dev/null; then
      branch_verdict[$branch]=weird
      row weird "$branch" "${local_sha:0:7}" "${target:0:7}" "$pr" "${wt:--}" "merged PR's head is not on main"
      return
    fi
  elif [[ -n "$closed_prs" ]]; then
    branch_verdict[$branch]=weird
    row weird "$branch" "${local_sha:0:7}" - - "${wt:--}" "no PR merged into main; ${closed_prs% }"
    return
  else
    # No PR of its own: a fresh thread, or a by-product of a restack (`<thread>-restacked`).
    local last_move
    last_move=$(git log -g -1 --format=%ct "refs/heads/$branch" 2> /dev/null || git log -1 --format=%ct "$branch")
    if [[ -n "$wt" ]] || (( now - last_move < fresh_secs )); then
      branch_verdict[$branch]=active
      row active "$branch" "${local_sha:0:7}" - - "${wt:--}" "no PR yet"
      return
    fi
    if git merge-base --is-ancestor "$local_sha" "$main_ref"; then
      target=$local_sha
    else
      target=$(main_match "$local_sha")
    fi
    if [[ -z "$target" ]]; then
      branch_verdict[$branch]=weird
      row weird "$branch" "${local_sha:0:7}" - - - "no PR, and its tip has no counterpart on main"
      return
    fi
    pr=-
  fi

  local unmatched
  unmatched=$(unmatched_commits "$branch" | head -5 | paste -sd ';' -)
  if [[ -n "$unmatched" ]]; then
    branch_verdict[$branch]=weird
    row weird "$branch" "${local_sha:0:7}" "${target:0:7}" "$pr" "${wt:--}" "commits with no counterpart on main: $unmatched"
    return
  fi
  if [[ -n "$tag_sha" && "$local_sha" == "$target" ]]; then
    branch_verdict[$branch]=done
    row done "$branch" "${local_sha:0:7}" "${target:0:7}" "$pr" "${wt:--}" "already swept"
    return
  fi
  if [[ -n "$tag_sha" ]]; then
    branch_verdict[$branch]=weird
    row weird "$branch" "${local_sha:0:7}" "${target:0:7}" "$pr" "${wt:--}" "closed/$branch already exists at ${tag_sha:0:7}, and the branch has moved off its target"
    return
  fi
  local beyond behind
  beyond=$(git rev-list --count "$target..$local_sha")
  behind=$(git rev-list --count "$local_sha..$target")
  if [[ "$local_sha" == "$target" ]]; then
    reason="local is the merged head"
  elif (( beyond == 0 )); then
    reason="local is $(commits "$behind") behind the merged head"
  elif git merge-base --is-ancestor "$local_sha" "$main_ref"; then
    reason="local sits on main, $(commits "$beyond") past the merged head"
  else
    reason="local was rewritten; each of its $(commits "$beyond") past the merged head has a counterpart on main"
  fi
  if [[ "$pr" == - ]]; then
    reason="no PR of its own; $reason"
  fi
  branch_verdict[$branch]=close
  row close "$branch" "$local_sha" "$target" "$pr" "${wt:--}" "$reason"
}

while read -r branch; do
  if [[ "$branch" == main ]]; then
    continue
  fi
  survey_branch "$branch"
done < <(git for-each-ref --format='%(refname:short)' refs/heads/)

survey_tree() {
  local path=$1 branch=$2 dirty precious procs recent locked
  if [[ ! -d "$path" ]]; then
    printf 'tree\tkeep\t%s\t%s\t%s\n' "$path" "$branch" "directory is gone: git marks it prunable"
    return
  fi
  if [[ "${branch_verdict[$branch]:-}" != close && "${branch_verdict[$branch]:-}" != done ]]; then
    printf 'tree\tkeep\t%s\t%s\t%s\n' "$path" "$branch" "branch is ${branch_verdict[$branch]:-not a local branch}"
    return
  fi
  locked=$(git worktree list --porcelain | awk -v p="$path" '$0 == "worktree " p { hit = 1; next } /^worktree / { hit = 0 } hit && /^locked/ { print "locked" }')
  dirty=$(git -C "$path" status --porcelain | wc -l)
  precious=$(git -C "$path" ls-files -o -i --exclude-standard \
    ':(exclude,glob)**/node_modules/**' ':(exclude,glob)**/dist/**' ':(exclude,glob)**/coverage/**' \
    | grep -cvE "$junk_re" || true)
  procs=$( (ls -l /proc/*/cwd 2> /dev/null || true) | grep -cE -- "-> $path(/|$)" || true)
  recent=$(find "$path" \( -name node_modules -o -name .git -o -name dist \) -prune -o \
    -type f -mmin "-$recent_mins" -print 2> /dev/null | head -1)
  local why=()
  [[ -n "$locked" ]] && why+=("locked")
  (( dirty > 0 )) && why+=("$dirty uncommitted or untracked paths")
  (( precious > 0 )) && why+=("$precious ignored files that are not build output")
  (( procs > 0 )) && why+=("$procs processes running in it")
  [[ -n "$recent" ]] && why+=("files touched in the last $recent_mins minutes")
  if (( ${#why[@]} > 0 )); then
    printf 'tree\tkeep\t%s\t%s\t%s\n' "$path" "$branch" "branch is finished, but: $(IFS=';'; echo "${why[*]}")"
    return
  fi
  printf 'tree\tremove\t%s\t%s\t%s\n' "$path" "$branch" "branch is finished; clean, idle"
}

while IFS=$'\t' read -r path branch; do
  survey_tree "$path" "$branch"
done < "$scratch/worktrees.tsv"

# Remote branches whose PR is finished: only counted, since GitHub's own setting is the way to
# clear them, and they are not ours to delete.
remote_finished=$(git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin/ \
  | jq -R . | jq -s --slurpfile prs "$scratch/prs.json" '
      [.[] as $br | select($br != "HEAD" and $br != "main")
        | select(any($prs[0][]; .headRefName == $br and .state != "OPEN"))
        | select(all($prs[0][]; .headRefName != $br or .state != "OPEN"))] | length')
printf 'remote\t%s\t%s\n' "$remote_finished" "branches on origin whose every PR is merged or closed"
