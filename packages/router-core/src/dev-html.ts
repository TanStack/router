export interface ExtractedHtmlTagInfo {
  attributes: Record<string, string | boolean>
  content: string
}

/**
 * Extracts specified HTML tags from content along with their attributes and inner content
 * @internal
 * @param tagName - Name of the HTML tag to extract (e.g., 'script', 'meta', 'div')
 * @param htmlContent - String containing HTML content
 * @returns Array of objects with tag attributes and content
 */
function extractHtmlTagInfo(
  tagName: string,
  htmlContent: string,
): Array<ExtractedHtmlTagInfo> {
  const tags: Array<ExtractedHtmlTagInfo> = []
  // Create a regex pattern based on the provided tag name
  // This regex will match both self-closing tags and tags with content
  const tagRegex = new RegExp(
    `<${tagName}\\b([^>]*?)(?:>([\\s\\S]*?)</${tagName}>|\\s*/?>)`,
    'gi',
  )

  let match
  while ((match = tagRegex.exec(htmlContent)) !== null) {
    const attributesString = match[1] || ''
    // For self-closing tags or tags with no content, this will be undefined
    const content = match[2] || ''

    // Parse attributes
    const attributes: Record<string, string | boolean> = {}
    const attributeRegex = /(\w+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]*))?)?/g
    let attrMatch

    while ((attrMatch = attributeRegex.exec(attributesString)) !== null) {
      const attrName = attrMatch[1]
      if (!attrName) {
        continue
      }

      // Check if this is a boolean attribute (no value or empty string)
      if (
        attrMatch[2] === undefined &&
        attrMatch[3] === undefined &&
        attrMatch[4] === undefined
      ) {
        // Boolean attribute with no value, like <script async>
        attributes[attrName] = true
      } else {
        // Process attribute with value
        const attrValue = attrMatch[2] || attrMatch[3] || attrMatch[4] || ''

        // Convert string 'true'/'false' to boolean values
        if (attrValue.toLowerCase() === 'true') {
          attributes[attrName] = true
        } else if (attrValue.toLowerCase() === 'false') {
          attributes[attrName] = false
        } else {
          attributes[attrName] = attrValue
        }
      }
    }

    tags.push({
      attributes,
      content: content.trim(),
    })
  }

  return tags
}

/**
 * Converts a TagInfo object back into a valid HTML tag
 * @param tagName - The name of the HTML tag
 * @param tagInfo - The TagInfo object containing attributes and content
 * @returns A string representation of the HTML tag
 */
function buildHtmlTag(tagName: string, tagInfo: ExtractedHtmlTagInfo): string {
  // Start building the opening tag
  let htmlTag = `<${tagName}`

  // Add attributes
  for (const [key, value] of Object.entries(tagInfo.attributes)) {
    if (typeof value === 'boolean') {
      // For boolean attributes
      if (value === true) {
        // Boolean true attributes just include the attribute name
        htmlTag += ` ${key}`
      }
      // Boolean false attributes are omitted entirely
    } else {
      // For string attributes, add with quotes
      htmlTag += ` ${key}='${escapeAttributeValue(value)}'`
    }
  }

  // Self-closing tags vs. tags with content
  if (tagInfo.content.length === 0 && isSelfClosingTag(tagName)) {
    // Self-closing tag
    htmlTag += ' />'
  } else {
    // Regular tag with content (or empty content)
    htmlTag += `>${tagInfo.content}</${tagName}>`
  }

  return htmlTag
}

/**
 * Escapes special characters in attribute values
 * @param value - The attribute value to escape
 * @returns The escaped attribute value
 */
function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Determines if a tag is typically self-closing in HTML
 * @param tagName - The name of the tag to check
 * @returns True if the tag is typically self-closing
 */
function isSelfClosingTag(tagName: string): boolean {
  const selfClosingTags = [
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]
  return selfClosingTags.includes(tagName.toLowerCase())
}

export const __internal_devHtmlUtils = {
  extractHtmlTagInfo,
  buildHtmlTag,
}
