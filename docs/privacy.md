# Privacy and retention

## Application storage defaults

- Raw microphone audio is converted and streamed in memory through the Meta Gunu gateway and is not written to disk by the app or gateway.
- Camera access is off until a user request. One image is held only long enough to answer, then released; saving requires a separate explicit feature.
- Private conversations store no durable personal memories.
- Ordinary conversation records, durable memories, tasks, and usage are distinct records with separate deletion paths.
- Deleted memories are tombstoned immediately and excluded from future retrieval. A later maintenance job may hard-delete them after the configured recovery window.

## Provider data

Meta Gunu's database policy does not control provider retention. A deployment must publish the retention terms for OpenAI, Meta, hosting, observability, and any research connector it enables. The Responses API `store` setting is configured off for research in the foundation; provider safety and legal retention may still apply.

The Live session is configured with `store: false`, but provider safety and legal retention may still apply. The product does not claim access to ChatGPT saved memories. Meta Gunu memories belong to this application and can be reviewed, corrected, deleted, or cleared by the user.

## Security baseline

Development bearer tokens are for localhost/private testing only. Public deployment requires authenticated users, per-device credentials, TLS, secret rotation, encrypted backups, abuse controls, audit events, and a tested account-deletion workflow.
