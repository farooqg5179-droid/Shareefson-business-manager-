# Shareef Sons AI Automation

This is an isolated AI automation module. Existing application files do not need to be modified to create these files.

## What it supports

- English + Roman Urdu + Urdu/mixed commands
- AI command planning with Groq
- Customer search
- Booking search
- Invoice preparation
- Invoice creation after confirmation
- Quotation preparation
- Daily briefing
- Basic financial analysis
- Future-ready customer follow-up, smart notification and WhatsApp actions
- Admin confirmation before write/send actions

## Required Supabase secrets

Set these in the Supabase Edge Function environment:

- GROQ_API_KEY
- GROQ_MODEL (optional; default: llama-3.3-70b-versatile)

SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are supplied by the Supabase Edge Functions runtime.

## Important

The frontend service calls:

ai-automation

The React command center is intentionally not imported into the existing app yet. To keep the current app untouched, these files are standalone until you decide to connect the UI.

For production, WhatsApp sending should be connected through the official Meta WhatsApp Cloud API or another authorized provider. Do not put a Groq or WhatsApp secret in Vite client-side code.
