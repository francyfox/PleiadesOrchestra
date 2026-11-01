# CONTRIBUTORS

Check this one https://github.com/firstcontributions/first-contributions

So if you want to help me with code, I will be really happy.
On first version it's always very dirty. I planned first versions like proof of concept, and we 
can use AI first time. But from v2.X i planned use my classic coding style.


# Setup local Dev Environment

## Docker

- You can use a compose.yml for quick setup or install dependencies manually
- Use env.example (has root env and env for every app in `/apps` directory)

## Manual

- Install the latest version of [BUN](https://github.com/oven-sh/bun/releases)
- Install `bun i` and `bun dev` for running turborepo (all apps will be executed, so read about 
  TurboRepo manuals)

# Unit test

- We are using biome for lint, format files. If you are using Jetbrains IDEA, i recommended turn 
  on auto format in biome settings of your IDE
- `bun run test` for testing. Use bun/elysia tests or vitest if no this one


# Pull Request Guidelines


