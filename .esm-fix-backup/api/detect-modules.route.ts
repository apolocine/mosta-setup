// @mosta/setup — Detect modules API route factory
// Author: Dr Hamid MADANI drmdh@msn.com
import { discoverNpmModules } from '../lib/discover-modules'

export function createDetectModulesHandler() {
  async function GET() {
    const result = await discoverNpmModules()
    return Response.json(result)
  }
  return { GET }
}
