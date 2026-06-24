# react-interview

This is a simple React application using Vite as the build tool. Candidates are expected to build a Todo List UI by consuming the provided API. The scaffold includes basic setup and configurations to get started quickly.

The app reads from `VITE_API_URL` and refreshes the local backend snapshot on a
polling interval controlled by `VITE_API_POLL_INTERVAL_MS`.

### Run from the repository root

```bash
make frontend       # build + start the frontend and its api dependency
make urls           # print the frontend and api URLs
make logs-frontend  # tail the Vite dev server logs
make down           # stop the stack
```

### Installation

This project provides a development environment using **devContainers**. Open the repository in a devContainer using your preferred IDE (e.g., VS Code). The devContainer will have all dependencies pre-installed.

## Contact

- Martín Fernández (mfernandez@crunchloop.io)

## About Crunchloop

![crunchloop](https://s3.amazonaws.com/crunchloop.io/logo-blue.png)

We strongly believe in giving back :rocket:. Let's work together [`Get in touch`](https://crunchloop.io/#contact).
