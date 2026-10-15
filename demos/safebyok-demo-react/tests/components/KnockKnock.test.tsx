// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KnockKnock } from '../../src/components/KnockKnock'
import * as TH from '../test-helpers'

/** Anthropic as fetch sees it: a canned reply of `status`, recording the API key each request carried. */
const fakeAnthropic = (status: number, jokeText = '') => {
  const apiKeysSeen: (string | null)[] = []
  const reply = status === 200
    ? { id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: jokeText }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 20 } }
    : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    apiKeysSeen.push(new Request(input, init).headers.get('x-api-key'))
    return Promise.resolve(Response.json(reply, { status }))
  }))
  return { apiKeysSeen }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const knockAs = (whosThere: string) => {
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: whosThere } })
  fireEvent.click(screen.getByRole('button', { name: new RegExp(String.raw`${whosThere} Who\?`) }))
}

describe("KnockKnock", () => {
  it("won't knock without a key, and says how to add one", async () => {
    TH.makeWorld().renderInVault(<KnockKnock />)
    await screen.findByText(/No Anthropic API key yet/)
    fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Banana Who\?/ }).disabled).to.be.true
  })

  it("saves a key into the vault, asking for a new vault's passphrase on the way", async () => {
    const world = TH.makeWorld()
    world.renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: ' sk-ant-test-not-a-real-key ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic key in the vault/)
    const vault = await world.open()
    await vault.unlock(TH.Passphrase)
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("puts the key form away on Cancel, saving nothing", async () => {
    const world = TH.makeWorld()
    world.renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-test-not-a-real-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'add your key' })).to.not.be.null
    expect((await world.vaultDB.listBoxes(TH.scopeOf('u1')))).to.have.lengthOf(0)
  })

  it("tells the joke Claude tells, the key going to Anthropic and nowhere on the page", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const anthropic = fakeAnthropic(200, 'Banana who? Banana split, gotta run!')
    const { container } = world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Banana')
    await TH.answerPassphraseDialog()
    await screen.findByText('Banana who? Banana split, gotta run!')
    expect(anthropic.apiKeysSeen).to.deep.equal(['sk-ant-test-not-a-real-key'])
    expect(container.outerHTML).to.not.include('sk-ant-test-not-a-real-key')
  })

  it("knocks from the keyboard too", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    fakeAnthropic(200, 'Olive who? Olive you!')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    const field = screen.getByPlaceholderText('Banana')
    fireEvent.change(field, { target: { value: 'Olive' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await TH.answerPassphraseDialog()
    expect(await screen.findByText('Olive who? Olive you!')).to.not.be.null
  })

  it("says calmly that Anthropic refused the key, quoting none of it", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    fakeAnthropic(401)
    const { container } = world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Lettuce')
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic refused that API key/)
    expect(container.outerHTML).to.not.include('sk-ant-test-not-a-real-key')
  })

  it("gripes, rather than calling Anthropic, when the stored key is not text", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: { apiKey: 'sk-ant-test-not-a-real-key' } })
    const anthropic = fakeAnthropic(200, 'never told')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Banana')
    await TH.answerPassphraseDialog()
    await screen.findByText(/That joke got lost on the way/)
    expect(anthropic.apiKeysSeen).to.have.lengthOf(0)
  })

  it("tells nothing when the passphrase dialog is dismissed", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const anthropic = fakeAnthropic(200, 'never told')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Banana')
    await screen.findByPlaceholderText('vault passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByText(/clearing its throat/)).to.be.null })
    expect(screen.queryByText('never told')).to.be.null
    expect(anthropic.apiKeysSeen).to.have.lengthOf(0)
  })

  it("replaces a key already stored", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'replace it' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-test-replaced' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic key in the vault/)
    const vault = await world.open()
    await vault.unlock(TH.Passphrase)
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-replaced')
  })

  it("shows a refused save beside the key form: here, a key over the vault's limit", async () => {
    TH.makeWorld().renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'k'.repeat(50_000) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    expect(await screen.findByText(/over this vault's limit/, { selector: '.gripe' })).to.not.be.null
    expect(screen.getByRole('button', { name: 'Save key' })).to.not.be.null
  })
})
