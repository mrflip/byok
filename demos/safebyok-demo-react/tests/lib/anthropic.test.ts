import { describe, expect, it } from 'vitest'
import { JokeModel, buildJokePrompt, gripeForJokeErr, tellKnockKnockJoke } from '../../src/lib/anthropic'

/** A canned Anthropic response and a recorder for what the SDK actually sent. */
const makeFakeAnthropic = (jokeText: string) => {
  const seen: { url: string, apiKeyHeader: string | null, body: Record<string, unknown> }[] = []
  const fetchFn: typeof fetch = (input, init) => {
    const request = new Request(input, init)
    return request.text().then((bodyText) => {
      seen.push({
        url:          request.url,
        apiKeyHeader: request.headers.get('x-api-key'),
        body:         JSON.parse(bodyText) as Record<string, unknown>,
      })
      const reply = {
        id: 'msg_fake', type: 'message', role: 'assistant', model: JokeModel,
        content: [{ type: 'text', text: jokeText }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      }
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } })
    })
  }
  return { fetchFn, seen }
}

describe("buildJokePrompt", () => {
  it("works the user's entry into both knock-knock slots", () => {
    const prompt = buildJokePrompt('Banana')
    expect(prompt).to.include('Banana')
    expect(prompt).to.include('Banana who?')
  })
})

describe("tellKnockKnockJoke", () => {
  it("sends the key as the x-api-key header to the messages endpoint, and nothing else sees it", async () => {
    const fake = makeFakeAnthropic("Banana who? Banana split, gotta run!")
    const joke = await tellKnockKnockJoke('sk-ant-fake-key', 'Banana', fake.fetchFn)
    expect(joke).to.eq("Banana who? Banana split, gotta run!")
    expect(fake.seen).to.have.lengthOf(1)
    expect(fake.seen[0]?.url).to.include('api.anthropic.com/v1/messages')
    expect(fake.seen[0]?.apiKeyHeader).to.eq('sk-ant-fake-key')
  })

  it("asks the cheapest model, with the entry in the prompt", async () => {
    const fake = makeFakeAnthropic("Olive who? Olive you, that's who!")
    await tellKnockKnockJoke('sk-ant-fake-key', 'Olive', fake.fetchFn)
    expect(fake.seen[0]?.body.model).to.eq('claude-haiku-5-5')
    expect(JSON.stringify(fake.seen[0]?.body.messages)).to.include('Olive')
  })
})

describe("gripeForJokeErr", () => {
  it("says something calm and actionable for an unrecognized failure, quoting nothing", () => {
    const gripe = gripeForJokeErr(new Error('ECONNRESET sk-ant-oops'))
    expect(gripe).to.include('Knock again')
    expect(gripe).to.not.include('sk-ant-oops')
  })
})
