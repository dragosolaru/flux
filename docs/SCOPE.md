# SCOPE — Flux by DAO Lab

## Product

**Flux** is a multi-brand EV management web application built by DAO Lab. It is an **open portfolio project** intended to demonstrate AI-augmented engineering and modern full-stack architecture in a real, deployable product.

The MVP targets Tesla via the official Tesla Fleet API. The architecture is deliberately brand-pluggable so that BMW, Polestar, Rivian, Mercedes, and others can be added without rewriting the dashboard.

## Vision

> Democratize EV management across brands in one unified app — independent of the manufacturer's app.

Drivers shouldn't need a separate app per brand, with inconsistent UX and feature gaps. Flux gives EV owners more control, more insight, and more flexibility than any single OEM app provides. Long-term, Flux can become the layer that lets households or small businesses run multi-brand EV fleets without juggling logins.

## Target users

EV owners who want **more** than the stock manufacturer app gives them:

- Tesla owners who want a faster, cleaner dashboard with command shortcuts
- Households with mixed-brand vehicles who don't want one app per car
- Tech-leaning drivers who care about charging-tariff optimization and history
- Future: small businesses operating 2–10 EV fleets across brands

## MVP scope (this codebase)

- Tesla support only
- One connected vehicle per account
- Google OAuth + email/password sign-in
- Dashboard: battery gauge, range, locked state, odometer, climate, location
- Quick commands: lock / unlock, climate start / stop, honk, flash lights
- Charging page: current status, charge limit slider, recent sessions
- Settings: account info, vehicle disconnection, account deletion
- Dark mode first, light mode supported
- Encrypted Tesla tokens at rest (AES-256-GCM)
- Row-Level Security on every Supabase table

## Non-goals for MVP

- Native mobile app (iOS / Android)
- Multi-vehicle on a single account
- Fleet management (multi-driver, role-based access)
- Monetization, paywalls, subscription tiers
- Push notifications
- Routing / trip planning / supercharger search

## Future roadmap

| Phase | Theme                          | Highlights                                                                                       |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 0.2   | Trip statistics                | Daily / weekly drive distance, efficiency (kWh/100km), CO₂ saved                                 |
| 0.3   | Smart charging by tariff       | Hook into electricity-price APIs and auto-shift charging to off-peak windows                     |
| 0.4   | Multi-brand                    | BMW ConnectedDrive integration, brand interface formalized in `src/lib/<brand>/`                 |
| 0.5   | Polestar + Rivian              | Same brand interface, expanding coverage                                                         |
| 0.6   | Multi-vehicle per account      | Vehicle switcher in sidebar, per-vehicle dashboards                                              |
| 0.7   | iOS / Android widgets          | Read-only widget: battery + range, via web push or wrapper app                                   |
| 0.8   | Mercedes me + audi             | Continue brand coverage                                                                          |
| 1.0   | Monetization                   | Freemium tier (1 vehicle, basic dashboard) + Pro at €4.99/month (multi-vehicle, smart charging)  |

## DAO Lab context

Flux is the first public product under the **DAO Lab** umbrella. DAO Lab is an AI consulting company helping founders and teams design, build, and operate AI-augmented products.

This codebase serves a dual purpose:

1. **A real product** that we (and hopefully others) actually use.
2. **A live portfolio piece** that demonstrates the engineering quality DAO Lab brings to client projects — strict typing, schema validation at boundaries, encrypted sensitive data, RLS by default, and zero technical theater.

Every architectural decision in this repo is documented in `docs/ARCHITECTURE.md`. The intent is for prospective clients to be able to read the code, the scope, and the architecture, and form a precise opinion about what working with DAO Lab looks like.
