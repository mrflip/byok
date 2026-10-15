// Each test's render is unmounted after it. Testing Library does this by itself only where
// vitest's globals are on, which these tests leave off.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
