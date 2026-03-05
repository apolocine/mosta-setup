// @mosta/setup — API Route template for status check
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/status/route.ts

type NeedsSetupFn = () => Promise<boolean>

/**
 * Creates a GET handler for checking setup status.
 */
export function createStatusHandler(needsSetup: NeedsSetupFn) {
  async function GET() {
    const needed = await needsSetup()
    return Response.json({ needsSetup: needed })
  }

  return { GET }
}
