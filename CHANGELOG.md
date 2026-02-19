# Changelog

All notable changes to this project will be documented in this file.

## 3.1.4 - 2026-02-19

- simplified coding prompt
- context lenght calculation improvements
- docker integration
- update helper scripts
- Signals handling (SIGTERM/SIGINT)

## 3.1.3 - 2026-02-14

- hide/unhide file explorer button
- less literal coding-complex prompt
- helper scripts for starting the server and generating sri hash
- higher rate limits

## 3.1.2 - 2026-02-14

- **Security**: Implemented rate limiting using the `express-rate-limit` package to prevent DoS attacks:
  - Global rate limiter: 100 requests per minute for all endpoints
  - File system rate limiter: 50 requests per minute for `/api/config`, `/api/history`, and history modification endpoints
  - Addresses CodeQL high-severity security warnings

## 3.1.1 - 2026-02-11

- **Security & Reliability**: 
  - Fixed 5 CodeQL alerts by applying the rate limiter globally across all API endpoints.
  - Improved streaming reliability by switching to `once` listeners for request abortion events.

## 3.1.0 - 2026-02-11

- **Security Remediation Release**: Addressed critical vulnerabilities identified in AI code review.
  - Fixed Path Traversal vulnerability in history API endpoints.
  - Integrated DOMPurify for XSS protection in markdown rendering.
  - Added Subresource Integrity (SRI) hashes to external CDN dependencies.
  - Implemented in-memory rate limiting to mitigate DoS attacks.
  - Hardened file permissions for chat history storage (0o700 for directories, 0o600 for files).
  - Added input validation for Ollama URL and model parameters.

## 3.0.0 - 2026-02-10

- **File Explorer System**: Integrated a comprehensive file tracking system for AI-generated projects.
  - Real-time file detection from tagged code blocks.
  - Interactive tree view with directory support and file-type icons.
  - File preview modal for quick content inspection.
  - ZIP export functionality to download entire projects with structure.
- Enhanced Status Badges: Added `✓ Done` status indicator when generation completes.
- System Prompt Templates: optimized for structured multi-file code generation.
- Fixed model output parsing to handle abandoned code block tags.
- General UI cleanup and responsive design adjustments.

## 2.0.1 - 2026-02-08

- Copy button bugfixes
- Copy button that follows

## 2.0.0 - 2026-02-08

- Improved streaming UX so generation continues across thread switching and rebinds to the correct message when you return.
- Added stable per-message IDs used for DOM rebinding during streaming.
- Added thinking/reasoning UI: collapsible “Thinking” section with a short preview while collapsed.
- Added a Stop button to abort in-progress generation; improved abort handling to avoid server crashes.
- Added generation duration to assistant message metadata.
- Improved markdown rendering and code highlighting; bumped highlight.js to 11.11.1.
- Context usage badge moved to the page top-right and adjusted behavior:
  - Shows `0` for a brand-new thread.
  - Includes the system prompt once the conversation has started.
- Improved error messaging when the backend returns HTTP 500 (e.g. Ollama crash/CUDA error).

## 1.0.0 - 2026-02-07

- Model switcher — Lists models from your Ollama instance
- Streaming — Responses appear token-by-token
- Markdown & syntax highlighting — Code blocks with language tags
- Copy button — On every code block; shows "Copied!" on green background
- System prompt — Optional (default in config), great for "you are a coding assistant"
- History — Stored as JSON files under data/history/; list, open, delete (no database)
- Config — Set Ollama URL and default system prompt in config.json
