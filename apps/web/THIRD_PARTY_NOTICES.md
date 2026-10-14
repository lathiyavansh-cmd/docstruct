# Third-party interface components

The web client includes source code from the open-source component libraries below. Their authors publish
these components on [21st.dev](https://21st.dev). They affect only how the interface looks and moves. Every
DocStruct feature, including authentication, storage, text extraction, the comparison engine and the
change summary, is written by the team.

Each copied file starts with a `Source:` comment naming its origin. Some files were adapted: router links,
DocStruct colours, a light theme only, and type-only imports.

| Library | Author | Files | Licence |
| --- | --- | --- | --- |
| [animate-ui](https://animate-ui.com) | skyleen77 | `src/components/animate-ui/**`, `src/hooks/use-is-in-view.tsx`, `src/lib/get-strict-context.tsx` | MIT |
| [unlumen UI](https://ui.unlumen.com) (Animated Sidebar) | unlumen | `src/components/unlumen-ui/sidebar-001.tsx` | MIT |
| [Magic UI](https://magicui.design) | dillionverma | `src/components/magicui/**` | MIT |
| [motion-primitives](https://motion-primitives.com) | ibelick | `src/components/motion-primitives/**` | MIT |

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
