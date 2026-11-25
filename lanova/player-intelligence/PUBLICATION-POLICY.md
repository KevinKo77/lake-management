# Publication policy — Player Intelligence (fail closed)

The whole repository is the public site, so **any file committed here is published**. A historical dataset may enter it only through the gate in `scripts/player-intelligence/publication_gate.mjs`, under the reviewed policy `publication-policy.json`. **The default is DENY.**

## What authorises a public output, and what does not
| Signal | Can it authorise publication? |
|---|---|
| `rightsDecision: "ACCEPTED"`, `synthetic: true`, `licence`, any other field in a source manifest | **No.** Manifests are information only. The build strips `synthetic` and `rightsDecision`, and the gate never reads them. |
| `synthetic: true` in a registry or dataset | **No.** A dataset is "synthetic" only when the gate classifies it as the approved fictional fixture. |
| A SHA-256 matching the manifest | **No.** It proves the file is intact relative to the manifest, not that its use is authorised. |
| An approval in `publication-policy.json` for **this exact output path** | **Necessary**, not sufficient. All of the following must also hold. |
| Source and registry bytes equal the hashes the approval pins | Required: a substituted source or registry is refused. |
| Source not on the policy's `blocked` list | Required: the blocked list beats any approval. The 2025/26 LaLiga full file is blocked. |
| **Fictional fixture**: the bytes are exactly what the reviewed generator `make_demo_fixture.mjs` produces, and the generator is the pinned one (SHA-256 in the approval) | Required. Fictional status is **proven by regeneration**, not declared. |
| **Licensed source**: a separate evidence file under `rights/`, pinned by SHA-256, naming the licensor and the instrument, with commercial use and redistribution granted for this exact source and an independent review | Required. Rights evidence is kept apart from source manifests. |
| The approval records who approved it and where it was reviewed | Required. |
| The built output equals the output SHA-256 the approval pins | Required (exit 3 otherwise). |

**Output paths.** The parent directory is resolved through symbolic links before the check, which covers `..` traversal, absolute paths and directory links pointing into the repository.

The target is examined with `lstat`, never with a call that follows links. **Any symbolic link at the target is refused, including a dangling one.** Anything else that is not a regular file (a directory, for example) is refused too, and so is a missing directory.

The bytes are then written to a new file created exclusively in the same real directory, and `rename()` replaces the directory entry itself. A link planted between the check and the write is replaced, never written through.

**Outside the repository.** Writing there is allowed only as **RESTRICTED** local data. The dataset is labelled `synthetic: false` and `publication: "RESTRICTED — local only, not for publication"`.

**The browser.** The page loads its dataset only if the SHA-256 of the bytes it receives equals the approved fictional output. A tampered file, even one labelled "synthetic", is refused.

**The published-tree scan.** `node scripts/player-intelligence/publication_gate.mjs` runs as its own CI job and inside the unit tests. It inspects **every** git-tracked file. Fail closed: a file it cannot inspect is **rejected**, never skipped. That covers:
- files larger than 50 MB, unless approved by exact path and SHA-256;
- tracked symbolic links, including dangling ones;
- anything that is not a regular file;
- tracked paths missing from the checkout;
- unreadable files.

It looks for:
- Player Intelligence datasets, registries and decision contexts;
- Football.TXT "full" match files;
- files whose SHA-256 is on the blocked list.

Each one must be an approved artifact at its approved path with its approved bytes. This catches data committed **without** going through the build. The four approved artifacts today are the fictional fixture source, registry, output and generator.

## Trust boundary (what the software cannot guarantee)
The gate, the policy, the tests and the CI workflow are all in this repository. **Anyone who can push to `main` without review can change any of them, and so can publish anything.** A software guard cannot stop a person with unrestricted write access to the code and to the CI. The guarantees above hold only if these review controls are in place on GitHub. They are **repository settings**, which the founder must enable; this PR does not change them:

1. **Branch protection on `main`:**
   - require a pull request;
   - require **review from Code Owners** (`.github/CODEOWNERS` assigns the policy, rights evidence, gate, demo data, tests and workflows to the founder);
   - dismiss stale approvals;
   - no bypass for administrators, or bypass logged and limited.
2. **Required status checks:** the "LANOVA V3 validation" jobs, including "Publication gate · Player Intelligence (fail closed)", on the exact head commit.
3. **Review rule:** a change to `publication-policy.json`, `rights/`, the gate, or the fixture generator is a **rights decision**, not a code change. The reviewer checks the evidence itself, not only the diff.
4. **Human review remains required for unknown encodings and formats.** The scan recognises only known formats (the JSON schemas, the Football.TXT "full" layout and blocked hashes) and rejects what it cannot inspect. Data re-encoded into another format, compressed, split across files or embedded in other content would not be recognised. Reviewers remain responsible for every new data-bearing file, whatever its format.

## Changing the policy
- **Fictional fixture:** change `make_demo_fixture.mjs`, regenerate, rebuild, then update the pinned hashes in the same reviewed PR. The tests fail until the hashes match.
- **External source:** add a reviewed evidence file under `rights/` and an approval of kind `licensed-source` that pins the source, registry, output and evidence hashes. Record the founder's approval and the review reference, and update `SOURCE-RIGHTS.md`.
