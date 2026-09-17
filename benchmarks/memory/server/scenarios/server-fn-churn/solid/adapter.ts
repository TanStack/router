import {
  createSolidServerFunctionGetRequest,
  createSolidServerFunctionPostRequest,
  validateSolidServerFunctionResponse,
} from '../../../../../solid-server-functions'
import type { PayloadFixture, ServerFnChurnAdapter } from '../shared'

function buildGetRequest(url: string, fixture: PayloadFixture) {
  return createSolidServerFunctionGetRequest(
    url,
    [{ method: 'GET', data: { id: fixture.id } }],
    `memory-get:${fixture.id}`,
  )
}

function buildPostRequest(url: string, fixture: PayloadFixture) {
  return createSolidServerFunctionPostRequest(
    url,
    [{ method: 'POST', data: { id: fixture.id } }],
    `memory-post:${fixture.id}`,
  )
}

export const solidServerFnChurnAdapter: ServerFnChurnAdapter = {
  buildGetRequest,
  buildPostRequest,
  validateResponse: validateSolidServerFunctionResponse,
}
