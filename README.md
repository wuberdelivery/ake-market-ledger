# AKE Market Ledger

> **Voice-First Mobile Ledger for African Markets, Powered by N-ATLaS**

## Overview
AKE Market Ledger is a localized, offline-first mobile application designed for micro-merchants and market traders across Nigeria. It allows users to record sales, expenses, and inventory hands-free using voice prompts in English, Nigerian Pidgin, Yoruba, Hausa, and Igbo.

## N-ATLaS Integration
The app integrates **N-ATLaS** (`NCAIR1/N-ATLaS`) as its primary speech-to-text and intent-parsing engine via a modular provider architecture (`sttProviders.ts`). Voice audio clips are captured via native audio hooks and securely routed to the N-ATLaS inference pipeline to extract transaction details (product, quantity, price) and auto-populate the ledger.

> **Mandatory Attribution:** *N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.*

## Architecture & Tech Stack
* **Frontend:** React Native / TypeScript (`App.tsx`, `VoiceSaleScreen.tsx`)
* **Database:** Local SQLite (`database.ts`, `ledgerRepository.ts`) with encrypted sync engine.
* **Voice Pipeline:** Custom audio recorder player hooked into multi-provider STT router (`sttProviders.ts`).

## Setup & Installation
1. Clone the repository: `git clone https://github.com/wuberdelivery/ake-market-ledger.git`
2. Install dependencies: `npm install`
3. Configure your N-ATLaS API credentials in app settings or environment variables.
4. Run mobile build: `npx react-native run-android` or `ios`.
