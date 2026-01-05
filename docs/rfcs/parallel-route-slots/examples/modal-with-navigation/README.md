# Modal with Navigation

A global modal slot that can be opened from anywhere in the app. The modal has its own internal navigation (user profiles with tabs, settings pages, etc.).

## URL Examples

```
/products                                    # modal closed
/products?@modal=/                           # modal open at index
/products?@modal=/users/123                  # viewing user 123
/products?@modal=/users/123&@modal.tab=activity  # user 123, activity tab
/products?@modal=/settings                   # settings view in modal
/checkout?@modal=/users/123                  # modal persists across main navigation
```

## File Structure

```
routes/
├── __root.tsx          # defines modal slot, renders SlotOutlet
├── @modal.tsx          # modal wrapper (backdrop, close button, animation)
├── @modal.index.tsx    # modal landing/index view
├── @modal.users.$id.tsx    # user profile view
├── @modal.settings.tsx     # settings view
├── index.tsx           # home page
├── products.tsx        # products layout
├── products.index.tsx  # products list
└── products.$id.tsx    # product detail
```
