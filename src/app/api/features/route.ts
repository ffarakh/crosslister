/** Which optional features are configured. Lets the UI hide what isn't set up. */
export function GET() {
  return Response.json({ ai: Boolean(process.env.ANTHROPIC_API_KEY) });
}
