---
# Cockpit quest file, v2 (Orbit). Same file-first idea as Phase 0, plus `items` and per-step `beats`.
# Old v1 files (title / doneWhen / bundle / "- [ ]" objectives) must still load: treat each objective
# as a step with one generic beat ("Here's step N: <title>. Say done when it's finished.").
title: Get your Fiverr seller profile live
doneWhen: Seller account created, profile filled in, skills added, phone verified
status: active
voice: playful            # steady | playful (a Settings default; a quest may override)

items:
  acct:    { type: link,      title: "Fiverr · Join as a seller", url: "https://www.fiverr.com", cta: "Open sign-up page",
             preview: [["Email", "nick@…"], ["Username", "nick_automates"], ["Password", "••••••••••"]] }
  acctck:  { type: checklist, title: "Account setup", checks: ["Sign up with your work email", "Pick a username", "Turn on 2-step verification"] }
  profile: { type: link,      title: "Your profile editor", url: "https://www.fiverr.com", cta: "Open profile editor",
             preview: [["Display name", "Nick · AI Automation"], ["Photo", "Upload a real photo"], ["Description", "Paste your bio"]] }
  bio:     { type: draft,     title: "Your bio", cta: "Copy bio",
             text: "I build automations for gyms and studios. Every new lead gets a reply in minutes, follow-ups run on their own, and trials get booked while you coach." }
  skills:  { type: tags,      title: "Your 5 skills", cta: "Copy all", tags: ["AI automation", "n8n", "Lead follow-up", "CRM integration", "Chatbots"] }
  verify:  { type: checklist, title: "Verify + secure", checks: ["Verify your phone number", "Turn on 2-step verification", "Set your availability"] }

intro:
  - say: "Evening, Nick. One quest tonight: your Fiverr seller profile. Four moves, about thirty minutes, and I've already laid out the first one. Want to dive in?"
  - replies: [{ label: "Let's dive in" }, { label: "Give me a sec", answer: "Take your time. I'm not going anywhere." }]

steps:
  - id: account
    title: Create your seller account
    short: Seller account
    icon: "↗"
    beats:
      - { say: "Here's the door. Click through and claim your seller account. I'll keep watch from here.", focus: acct, support: [acctck] }
      - replies: [{ label: "I'm in" }, { label: "Which email?", answer: "Your work one. Keeps buyer pings out of your personal life." }]
      - { say: "Love it. When it offers 2-step verification, say yes. I'll tick the boxes as you go.", tick: acctck }
      - replies: [{ label: "Account's made" }]
      - { say: "That's one down. Next, we make you look like the obvious hire. Your bio's already written. Want to see it?", stepDone: true }
      - replies: [{ label: "Show me" }]
  - id: profile
    title: Customize your profile
    short: Profile
    icon: "✎"
    beats:
      - { say: "Your profile, waiting for a face and a story. The story's on the right. Copy it in.", focus: profile, support: [bio] }
      - replies: [{ label: "Copied it" }, { label: "Make it punchier", answer: "Tightened it. Two lines, zero fluff." }]
      - { say: "One thing: real photo, real smile. People buy from people." }
      - replies: [{ label: "Profile's saved" }]
      - { say: "You're looking hireable. Next: skills, so buyers can actually find you. Half a minute. Go?", stepDone: true }
      - replies: [{ label: "Go" }]
  - id: skills
    title: Add skills + languages
    short: Skills
    icon: "◆"
    beats:
      - { say: "Five skills, pulled from what buyers really search. Drop them in.", focus: skills, support: [bio] }
      - replies: [{ label: "Added them" }, { label: "Why these?", answer: "They're the exact words people type. Match them, show up more." }]
      - { say: "Last stretch: lock it down, then you're officially open for business. Ready?", stepDone: true }
      - replies: [{ label: "Let's finish" }]
  - id: verify
    title: Verify + secure
    short: Verify
    icon: "☑"
    beats:
      - { say: "Phone check and 2-step. This one has your name on it. I can't do it for you.", focus: verify, support: [profile] }
      - { say: "No rush. I'll check things off as you confirm.", tick: verify }
      - replies: [{ label: "Verified" }]
      - { say: "And that's the quest. Your seller profile is live. I lined up the next one: your first gig. Ride the momentum, or take a breather?", stepDone: true, end: true }
      - replies: [{ label: "Take a breather", answer: "Earned it. I'll be right here." }, { label: "Ride it", answer: "That's the spirit. The gig editor will be waiting." }]
---
Notes for this quest go here (free text, shown in the journal).
