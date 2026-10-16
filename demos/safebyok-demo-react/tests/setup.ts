// Each test's render is unmounted after it, and the vaults it opened from outside the page are
// closed. Testing Library unmounts by itself only where vitest's globals are on, which these
// tests leave off.
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'
import { closeOpenedVaults } from './opened-vaults'

afterEach(cleanup)
afterEach(closeOpenedVaults)

// A findBy or waitFor returns the moment its condition holds, so its ceiling costs nothing when
// the test passes. What it waits on includes making a vault (its keys, its stores), which on a
// loaded CI machine outlasts the default second; the test's own ceiling (vite.config.ts) is higher.
configure({ asyncUtilTimeout: 5000 })
