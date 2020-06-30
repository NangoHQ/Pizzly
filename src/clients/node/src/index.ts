/**
 * Node.js client for Pizzly
 */

import PizzlyIntegration from './integration'
import Types from './types'

class Pizzly {
  readonly key: string
  readonly origin: string

  /**
   * Initialize Pizzly
   */

  constructor(options: { host: string; secretKey?: string }) {
    if (!options) {
      const errorMsg =
        'Could not initialize Pizzly. Make sure to initialize by providing your Pizzly instance URL:\n' +
        'const pizzly = new Pizzly({host: "pizzly.example.org"}).'
      throw new Error(errorMsg)
    }

    this.key = options.secretKey || ''
    const host = options.host

    if (host.startsWith('http://') || host.startsWith('https:')) {
      this.origin = new URL(host).href
    } else {
      this.origin = new URL('https://' + host).href
    }

    return this
  }

  /**
   * Integration
   */

  public integration(integration: string, options?: Types.IntegrationOptions) {
    if (!integration) {
      const errorMsg =
        'Integration name is null or empty. It should be the slugname of an API (e.g. "github", "slack", etc.)'
      throw new Error(errorMsg)
    }

    return new PizzlyIntegration(integration, options || {}, this.key, this.origin)
  }
}

export default Pizzly
module.exports = Pizzly
