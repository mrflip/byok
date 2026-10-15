// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App'

afterEach(() => { localStorage.clear() })

describe("App", () => {
  it("shows the sign-in strip and both inspection panels to a visitor, and no vault", () => {
    render(<App />)
    expect(screen.getByPlaceholderText('username')).to.not.be.null
    expect(screen.getByText(/The backend database/)).to.not.be.null
    expect(screen.getByText(/This device/)).to.not.be.null
    expect(screen.queryByText('The Knock-Knock Machine')).to.be.null
  })

  it("opens the signed-in user's vault: the knock-knock machine and the dashboard appear", async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'margo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/No lockboxes yet/)
    expect(screen.getByText('The Knock-Knock Machine')).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByText('The Knock-Knock Machine')).to.be.null
  })
})
