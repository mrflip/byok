// Each test's render is unmounted after it, and the vaults it opened from outside the page are
// closed. Testing Library unmounts by itself only where vitest's globals are on, which these
// tests leave off.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { closeOpenedVaults } from './opened-vaults'

afterEach(cleanup)
afterEach(closeOpenedVaults)
