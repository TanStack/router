# React adapter

Test | main | remove-pending | refactor-signals
| --- | --- | --- | --- |
async loader, async beforeLoad, pendingMs | 10-13 | 8 | 8
redirection in preload | 4 | 1 | 1
sync beforeLoad | 9-12 | 5 | 5
nothing | 6-9 | 3 | 3
not found in beforeLoad | 7 | 2 | 2
hover preload, then navigate, w/ async loaders | 16 | 5 | 3
navigate, w/ preloaded & async loaders | 7-8 | 3 | 3
navigate, w/ preloaded & sync loaders | 6 | 3 | 3
navigate, w/ previous navigation & async loader | 5 | 3 | 3
preload a preloaded route w/ async loader | 1 | 0 | 0

# Solid adapter

Test | main | remove-pending | refactor-signals
| --- | --- | --- | --- |
async loader, async beforeLoad, pendingMs | 10-13 | 8 | 9
redirection in preload | 6 | 2 | 2
sync beforeLoad | 8 | 4 | 5
nothing | 6-10 | 3 | 3
not found in beforeLoad | 7 | 2 | 2
hover preload, then navigate, w/ async loaders | 16 | 3 | 3
navigate, w/ preloaded & async loaders | 9-13 | 3 | 3
navigate, w/ preloaded & sync loaders | 7 | 3 | 3
navigate, w/ previous navigation & async loader | 5 | 3 | 3
preload a preloaded route w/ async loader | 2 | 0 | 0

# Vue adapter

Test | main | remove-pending | refactor-signals
| --- | --- | --- | --- |
async loader, async beforeLoad, pendingMs | 27 | 26 | 16
redirection in preload | 10 | 8 | 5
sync beforeLoad | 25 | 23 | 12
nothing | 14-26 | 14-16 | 6
not found in beforeLoad | 22 | 18 | 5
hover preload, then navigate, w/ async loaders | 38 | 30 | 17
navigate, w/ preloaded & async loaders | 18 | 16 | 10
navigate, w/ preloaded & sync loaders | 16 | 15 | 6
navigate, w/ previous navigation & async loader | 12 | 12 | 6
preload a preloaded route w/ async loader | 3 | 3 | 2
