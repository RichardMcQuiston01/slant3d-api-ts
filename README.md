# Slant3D API TypeScript Wrapper

## Overview

Slant 3D runs a big 3D printing farm. You send them a 3D model file, and they
print it, pack it, and ship it to your customer. Slant 3D also has an API,
which is a way for computer programs to talk to their service.

This package lets your own code use that API. You do not have to write the
web requests yourself.

With it, your code can:

- upload 3D model files and see a price before you buy
- place orders and check on them
- get a message when an order ships
- look up the materials, colors, and parts you can order

The package takes care of signing in, retrying when the network hiccups, and
turning errors into clear messages. It also describes the shape of every piece
of data, so your code editor can catch mistakes before you run anything.

It is written in TypeScript. It works in Node.js, Bun, Deno, and other places
that run JavaScript. It does not need any other packages to work.

This is an unofficial package. It is not made by Slant 3D.

## Getting Started

See [GETTING_STARTED.md](./GETTING_STARTED.md) for installation, setup, and
examples.

## License

MIT

## Copyright

Copyright (c)2026 Richard McQuiston

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[**Donate via Stripe**](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800), or scan:

[![Donate via Stripe](./donate.svg)](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800)
