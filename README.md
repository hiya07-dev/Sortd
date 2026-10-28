# Sortd

AI-powered personal information organizer. Drop in PDFs, screenshots or pasted messages, and Sortd pulls out tasks, deadlines and events into one clean dashboard.

## Features
- Paste text or upload files, then extract tasks, events and deadlines
- Review and confirm step before anything is saved
- Dashboard with upcoming deadlines, course progress and focus list
- Smart alerts: overdue items, due soon, conflicting dates, busy days
- Tasks, calendar and documents views
- Source viewer that highlights where each task came from
- Global search (Ctrl/Cmd + K)
- Export to .ics calendar, dark mode, mobile layout

## Tech stack
HTML5, CSS3 (glassmorphism, CSS variables, Grid/Flexbox), vanilla JavaScript, localStorage.

## Project structure
```
sortd/
├── index.html   # page markup
├── style.css    # glassmorphism theme, layout, dark mode
├── script.js    # app logic: extraction, alerts, views, search
└── assets/logo.png
```

## Run locally
Open `index.html` in any browser. No install or build step needed.

## Prototype note
Extraction is simulated in the browser with rule-based parsing (regex for dates, times and course codes plus keyword detection). PDF and image uploads use sample text instead of real OCR.

## Roadmap
React/Next.js frontend, FastAPI or Node backend, PostgreSQL, OCR (Tesseract / Cloud Vision), LLM-based structured extraction, push/email alerts, Google Calendar sync.
