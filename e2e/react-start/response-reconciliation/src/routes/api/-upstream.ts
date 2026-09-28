// An upstream reply whose headers describe its own body and client. Start must
// not copy them onto the error body it generates for this failure.
export function createUpstreamFailure() {
  return new Response('<p>upstream</p>', {
    status: 502,
    headers: {
      'content-encoding': 'gzip',
      'content-length': '999',
      'content-type': 'text/html',
      'set-cookie': 'upstream-session=leaked; Path=/',
      'x-upstream': 'yes',
    },
  })
}
