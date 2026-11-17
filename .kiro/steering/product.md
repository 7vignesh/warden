# Product Context

## Problem
Tool-using AI agents read logs, tickets, and policy files. Anyone who can write to those sources can manipulate the agent (indirect prompt injection, excessive agency, confused-deputy trust). Most people only practice chat-style jailbreaks, so they never see this attack class in action.

## Target user (single persona)
A developer or AppSec/platform engineer building or reviewing agent systems who wants hands-on intuition for environment-based attacks.

## Core user journey (3 steps)
1. Read the briefing and inspect the environment files.
2. Edit the permitted files and talk to the warden so it requests the unlock.
3. Read the debrief: what you exploited, why the agent trusted it, how to defend.

## Unique selling point
The mechanic is environment manipulation, not chat jailbreaking. A deterministic engine holds the real lock; a warden (rule-based simulator, or a real LLM running locally in the browser) is the gatekeeper you try to fool.

## Hackathon category
Frankenstein: in-browser WebGPU LLM + deterministic rule engine + declarative levels + retro CRT terminal.

## Principles
- Start playable instantly (Simulator mode). AI mode is an enhancement, never a requirement.
- The engine is the security boundary. The model only proposes actions.
- Be honest: the Simulator is rule-based, not an LLM. Report measured benchmark results, not claims.
- No servers, no API keys, no accounts.
- Every feature must be demoable in a 3-minute video.
- Positioning: a training simulator for attack patterns, not a tool that tests real agents.
