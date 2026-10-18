# Cockpit — Connectors & First Workflow

> Saved 2026-10-17. Source: claude.ai connector directory search on 2026-10-17 (FACT: what's listed and connected as of that date). Availability inside Cockpit itself is *(verify)* — see note at bottom.

## Decisions (2026-10-17)
- **Platform:** Windows.
- **Voice:** wake word (push-to-talk as fallback).
- **First workflow:** create a **Fiverr gig page for AI automation services** (assumed "Fiber" = Fiverr).
- **Connect first:** only what the first workflows need.

## First workflow as a quest template

**Quest:** Launch my AI automation gig on Fiverr
**Done when:** the gig is published with packages, copy, images and at least two portfolio samples.

| # | Objective | Type | Uses |
|---|---|---|---|
| 1 | Research what sells: top AI-automation gigs, how they title, price and package | Companion preps, you approve | Web search, browser |
| 2 | Pick the niche and define 3 packages (basic / standard / premium) | You + companion | Notes / Journal |
| 3 | Write gig copy: title, description, FAQ, tags, buyer requirements | Companion drafts, you edit | Docs, writing-voice tool (optional) |
| 4 | Make gig images (and optional intro video) | Companion preps in design tool, you approve | Canva |
| 5 | Build 2 portfolio demos (real automations, screenshots / short recording) | You build, companion assists | n8n (or Make / Zapier), Google Drive |
| 6 | Publish on Fiverr and route order/message notifications into Cockpit | You submit (Act tier) | Browser, Gmail, Calendar |

**FACT:** no Fiverr connector exists in the directory. Fiverr steps run through the browser, and **you** press publish. Agents prep; they don't submit.

**Counter-case:** "AI automation" is a crowded category on freelance marketplaces *(unverified — objective 1 checks it)*. A generic gig will compete on price. **INFERENCE:** a niche you already know (for example gym/studio lead follow-up and CRM automation, from running a gym sales pipeline) is easier to sell and to build demos for. **Test:** after objective 1, if the niche's top gigs show demand and pricing worth it, go niche. If not, pick a different vertical before writing copy.

## Connect now (for this workflow)

| Connector | Status | Why |
|---|---|---|
| Google Drive | **Connected** | Portfolio files, gig assets, research notes |
| Canva | Not connected | Gig images, thumbnails, intro-video frames |
| n8n | Not connected | Build and run the automation demos you'll sell (Make or Zapier are alternatives — pick one) |
| Gmail | Not connected | Fiverr order and message notifications into Inbox |
| Google Calendar | Not connected | Delivery deadlines and client calls |
| Bonsai | Not connected | Optional: client CRM, projects and invoices once orders come in |

## Directory scan for Cockpit as a whole (2026-10-17)

| Cockpit area | Best fits found | Notes |
|---|---|---|
| **Quest sources (task import)** | Todoist, TickTick, Notion, ClickUp, Asana, Linear | Pick one personal task app; Notion if you want notes + tasks together |
| **Comms / Inbox** | Gmail, Google Calendar, Slack, Microsoft 365 (Outlook, OneDrive, Teams) | Microsoft 365 only if you use Outlook on Windows |
| **Files** | Google Drive (connected), Dropbox | Drive is enough to start |
| **Creative** | Canva, Figma, Adobe, Tella (video), vidIQ (YouTube/TikTok research) | vidIQ + Tella fit the AI avatar content workflow later |
| **Automation (your service + Cockpit plumbing)** | n8n, Make, Zapier | One platform both for client work and Cockpit triggers |
| **Freelance / business** | Upwork, Bonsai, HubSpot, Stripe | Upwork as a second marketplace; Bonsai for freelance ops |
| **Writing** | Idiolect (drafts in your own voice) | Useful for gig copy and client messages |
| **Voice / dictation** | Wispr Flow, ElevenLabs (voice agents) | The companion's own voice comes from Cockpit's speech engine, not a connector |
| **Focus** | Spotify | Companion can start a focus playlist when a quest begins |
| **Trading** | Webull (connected) | Read-only market data in Cockpit; orders stay manual |
| **Browser automation** | TinyFish (cloud browser) | Probably unnecessary — Cockpit drives your local browser |

**Phase 2 shortlist (after the Fiverr quest works):** Todoist or Notion (quest import), Gmail + Calendar (Inbox and deadlines), Spotify (focus), Upwork (second marketplace), Webull read-only (pre-market prep quest).

## Note on how connectors reach Cockpit
**INFERENCE (medium confidence):** these are claude.ai connectors built on MCP. Cockpit, running on the Claude API, can likely use the same MCP servers so one connection serves both chat and Cockpit — **verify against current Claude API/MCP docs before Phase 2.** If that doesn't hold, Cockpit needs its own sign-in per app.
