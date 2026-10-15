import { Component, type ReactNode } from 'react'

/** What a {@link Boundary} is handed: what to show once something broke, and whom to tell. */
export type BoundaryProps = {
  /** Shown in the children's place once one of them has thrown while rendering. */
  fallback:  ReactNode
  /** Told once, when the boundary first catches: to say so to the user, say. */
  onCaught?: (() => void) | undefined
  children:  ReactNode
}

/**
 * The error boundary a safebyok-react component keeps at its own edge, so that nothing going
 * wrong inside it reaches the host's page: once a child throws while rendering, `fallback` shows
 * in the children's place for as long as the boundary stays mounted, and `onCaught` is told.
 * React reports what was caught as it reports any error a boundary catches, through the root's
 * `onCaughtError` (by default the console, with the component stack), so the developer sees it
 * and an error tracker hooked there receives it.
 *
 * An error from an event handler or a promise reaches it only when it is rethrown while
 * rendering, held in state and thrown on the next render, as `PassphraseModal` does.
 *
 * @example
 *   <Boundary fallback={<p>Something went wrong.</p>}>
 *     <UnlockForm vault={vault} onDone={onDone} />
 *   </Boundary>
 * @example <Boundary fallback={null} onCaught={() => { onGripe(trouble) }}><PasskeyPress {...props} /></Boundary>
 */
export class Boundary extends Component<BoundaryProps, { caught: boolean }> {
  override state = { caught: false }

  static getDerivedStateFromError() { return { caught: true } }

  override componentDidCatch() { this.props.onCaught?.() }

  override render() { return this.state.caught ? this.props.fallback : this.props.children }
}
