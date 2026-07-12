/** Wikimedia Commons image URL handling.
 *  P18 bindings arrive as http://commons.wikimedia.org/wiki/Special:FilePath/<File>;
 *  appending ?width=N redirects to a rendered thumbnail on upload.wikimedia.org. */

const THUMB_WIDTH = 400

export function commonsImageUrls(rawUrl: string): { url: string; thumbUrl: string } {
  const url = rawUrl.replace(/^http:\/\//, 'https://')
  const separator = url.includes('?') ? '&' : '?'
  return {
    url,
    thumbUrl: `${url}${separator}width=${THUMB_WIDTH}`,
  }
}
