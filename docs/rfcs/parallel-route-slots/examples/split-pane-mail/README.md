# Split-Pane Mail Client

An email client with two independently navigable panes: a message list and a message preview. Each pane has its own route state.

## URL Examples

```
/mail                                    # both panes at default
/mail?@list=/inbox                       # inbox selected, no preview
/mail?@list=/inbox&@preview=/msg-123     # inbox with message 123 preview
/mail?@list=/sent&@preview=/msg-456      # sent folder with message 456 preview
/mail?@list=/drafts                      # drafts, preview closed
```

## File Structure

```
routes/
├── __root.tsx
├── mail.tsx                # defines slots: list, preview
├── mail.@list.tsx          # message list wrapper
├── mail.@list.index.tsx    # default (all mail)
├── mail.@list.inbox.tsx    # inbox folder
├── mail.@list.sent.tsx     # sent folder
├── mail.@list.drafts.tsx   # drafts folder
├── mail.@preview.tsx       # preview pane wrapper
├── mail.@preview.index.tsx # empty state
├── mail.@preview.$id.tsx   # message preview
└── index.tsx
```

## Key Concepts

- Two slots that navigate completely independently
- Selecting a folder doesn't affect which message is previewed
- Deep linking works: `/mail?@list=/sent&@preview=/msg-789`
- Each pane loads its own data in parallel
