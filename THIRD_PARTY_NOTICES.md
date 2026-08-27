# Third-party notices

Drill Day is MIT-licensed project source. That license does not replace the licenses or terms of the software and services listed here.

## JavaScript dependencies

Dependency versions are locked in `pnpm-lock.yaml`. `pnpm licenses list --prod` reports the production dependency graph under these licenses:

- MIT: Next.js, React, React DOM, Babel packages, PostCSS, Browserslist packages, and related utilities.
- Apache-2.0: Sharp, SWC helpers, and related platform packages.
- ISC: Lucide React, semver, and related utilities.
- BSD-3-Clause: `source-map-js`.
- 0BSD: `tslib`.
- CC-BY-4.0: `caniuse-lite` data.
- LGPL-3.0-or-later: the platform-specific libvips binary distributed with Sharp.

Copyright and full license texts remain in each installed package. Run the command above against the locked release to regenerate the complete package-level inventory.

## WebMCP

The WebMCP API shape and terminology are based on the [W3C WebMCP specification](https://github.com/webmachinelearning/webmcp), available under the [W3C Software and Document License](https://github.com/webmachinelearning/webmcp/blob/main/LICENSE.md). Drill Day's implementation is independently authored project code.

## Autodesk Platform Services Viewer

The Autodesk Viewer runtime and stylesheet are loaded at runtime from Autodesk's official CDN. They are proprietary Autodesk software, are not vendored in this repository, and are not covered by Drill Day's MIT License. Use is subject to the [Autodesk Platform Services API Terms of Service](https://www.autodesk.com/company/legal-notices-trademarks/terms-of-service-autodesk360-web-services/forge-platform-web-services-api-terms-of-service/).

## Generated image

`public/media/northgate-leak-briefing.png` was generated with OpenAI GPT Image for Drill Day on August 27, 2026. No third-party logo, character, or reference artwork was supplied. See `public/media/README.md` for the prompt summary and intended use.
