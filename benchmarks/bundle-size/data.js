window.BENCHMARK_DATA = {
  "lastUpdate": 1780689555082,
  "repoUrl": "https://github.com/TanStack/router",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d8171c39948fd6c53d16f523868f74c880402583",
          "message": "feat(benchmarks): add file-based bundle-size suite + PR trend reporting (#6723)",
          "timestamp": "2026-02-21T19:28:30+01:00",
          "tree_id": "a456098db589c2174d7a767d50f2b17c44d741f3",
          "url": "https://github.com/TanStack/router/commit/d8171c39948fd6c53d16f523868f74c880402583"
        },
        "date": 1771698651021,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88842,
            "unit": "bytes",
            "extra": "raw=279268; brotli=77219"
          },
          {
            "name": "react-router.full",
            "value": 92002,
            "unit": "bytes",
            "extra": "raw=289990; brotli=79934"
          },
          {
            "name": "solid-router.minimal",
            "value": 36910,
            "unit": "bytes",
            "extra": "raw=110457; brotli=33208"
          },
          {
            "name": "solid-router.full",
            "value": 41359,
            "unit": "bytes",
            "extra": "raw=123860; brotli=37125"
          },
          {
            "name": "vue-router.minimal",
            "value": 53145,
            "unit": "bytes",
            "extra": "raw=151409; brotli=47735"
          },
          {
            "name": "vue-router.full",
            "value": 58119,
            "unit": "bytes",
            "extra": "raw=167391; brotli=52203"
          },
          {
            "name": "react-start.minimal",
            "value": 101627,
            "unit": "bytes",
            "extra": "raw=319193; brotli=87994"
          },
          {
            "name": "react-start.full",
            "value": 105121,
            "unit": "bytes",
            "extra": "raw=329346; brotli=90841"
          },
          {
            "name": "solid-start.minimal",
            "value": 49439,
            "unit": "bytes",
            "extra": "raw=148787; brotli=43722"
          },
          {
            "name": "solid-start.full",
            "value": 55051,
            "unit": "bytes",
            "extra": "raw=165122; brotli=48473"
          }
        ]
      }
    ],
    "Bundle Size (gzip)": [
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9c81d5ac571e4c2d3441f9ed7cd2eca9375b4d29",
          "message": "fix: handle beforeLoad throwing notFound correctly (#6811)",
          "timestamp": "2026-03-04T21:34:28+01:00",
          "tree_id": "2283046c8efe6d11e97a01c5c4a4f147d5b25f52",
          "url": "https://github.com/TanStack/router/commit/9c81d5ac571e4c2d3441f9ed7cd2eca9375b4d29"
        },
        "date": 1772656612704,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "vitorbarbosahilario@gmail.com",
            "name": "Vitor Hilário",
            "username": "ovitorhilario"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "64dee75088e3b6587bf886725f2bdc7e30b9275a",
          "message": "docs(start): add dynamic middleware section with authorization example (#6815)\n\n* docs(start): add dynamic middleware section with authorization example\n\n* docs(start): rename dynamic middleware to middleware factories\n\n* ci: apply automated fixes\n\n* docs(start): fix authMiddleware snippet in authorization example under middleware factories\n\n* ci: apply automated fixes\n\n---------\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-03-05T19:46:46+01:00",
          "tree_id": "7b68889f8f3a21180737b54e293c2210f5104d4e",
          "url": "https://github.com/TanStack/router/commit/64dee75088e3b6587bf886725f2bdc7e30b9275a"
        },
        "date": 1772736546237,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cc12980e166701878f0d3f164d1ccf411a3ef018",
          "message": "test: fix vue viewTransition e2e flakiness (#6830)",
          "timestamp": "2026-03-06T00:06:20+01:00",
          "tree_id": "2a04cb253c27bfda531f72d977115b02907c684e",
          "url": "https://github.com/TanStack/router/commit/cc12980e166701878f0d3f164d1ccf411a3ef018"
        },
        "date": 1772752365498,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "023fdfd152702d910c15d0cbdcd54cf26a08e130",
          "message": "benchmarks: bundle client-nav runtimes (#6832)",
          "timestamp": "2026-03-06T13:27:01+01:00",
          "tree_id": "923ad79550a0c9a701b11dd2faa1d8460b5b7ec5",
          "url": "https://github.com/TanStack/router/commit/023fdfd152702d910c15d0cbdcd54cf26a08e130"
        },
        "date": 1772800164812,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b46b2eef6763c6d73789c8b0e8b5883e6c94d783",
          "message": "test: faster benchmark ci (#6834)",
          "timestamp": "2026-03-06T18:10:09+01:00",
          "tree_id": "bb58285e046d9e2690e6bc08ab43a5f0d7034cc0",
          "url": "https://github.com/TanStack/router/commit/b46b2eef6763c6d73789c8b0e8b5883e6c94d783"
        },
        "date": 1772817150052,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "45029601+chapman-cc@users.noreply.github.com",
            "name": "Chapman Cheng",
            "username": "chapman-cc"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4ea2a62787d0b7c562a4d13ecdca45c4ffb27092",
          "message": "docs: Update route file name in routing concepts (#6807)\n\nfix: Update route file name in routing concepts\n\nThe code block title `src/routes/posts.tsx` does not match against the line above `posts.$postId.tsx`\r\n\r\nThis pr fixes this typo",
          "timestamp": "2026-03-07T03:19:13+01:00",
          "tree_id": "36f708bd5fe20dab75a45a90b1aad54f42e8f4e2",
          "url": "https://github.com/TanStack/router/commit/4ea2a62787d0b7c562a4d13ecdca45c4ffb27092"
        },
        "date": 1772850099253,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2534508a5dad3198b339bb4eee169badbe44aedd",
          "message": "test: cover vue Link transition slot state (#6852)",
          "timestamp": "2026-03-08T10:05:34+01:00",
          "tree_id": "572c35b2aa5d8e8bb550172dddb788002808e286",
          "url": "https://github.com/TanStack/router/commit/2534508a5dad3198b339bb4eee169badbe44aedd"
        },
        "date": 1772960881966,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "446d7973cfc5d930dc91cd8d1ef2d92e9fcb1296",
          "message": "test: cover Solid SSR route error rendering (#6854)\n\ntest: cover solid SSR route error rendering",
          "timestamp": "2026-03-08T10:11:30+01:00",
          "tree_id": "07d9a4e96be90e1f4ab2aa11224080eb570f9722",
          "url": "https://github.com/TanStack/router/commit/446d7973cfc5d930dc91cd8d1ef2d92e9fcb1296"
        },
        "date": 1772961323244,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7003ccb50f7e3b692ebb3dba8c2dd0f45157d047",
          "message": "fix(react-router): correct useLoaderDeps structural sharing types (#6860)",
          "timestamp": "2026-03-08T14:30:13+01:00",
          "tree_id": "f7baa65efc92062a4448ec6ef1d39a55730d33f8",
          "url": "https://github.com/TanStack/router/commit/7003ccb50f7e3b692ebb3dba8c2dd0f45157d047"
        },
        "date": 1772976758043,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "irsooti+code@gmail.com",
            "name": "Daniele",
            "username": "irsooti"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e5e0e79682c1632684ae3f1e5a779b86c2147456",
          "message": "docs: update cli instruction (#6810)",
          "timestamp": "2026-03-09T00:38:15+01:00",
          "tree_id": "d48bbabf6ecbef20aca79743acb9792dbcc77137",
          "url": "https://github.com/TanStack/router/commit/e5e0e79682c1632684ae3f1e5a779b86c2147456"
        },
        "date": 1773013238537,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2f35f933124740f06c08bceb5c0004abb3e1f1d7",
          "message": "chore: bump h3 and srvx (#6869)\n\n* bump h3 v2 to rc 16\n\n* bump srvx to 0.11.9\n\n* lockfile",
          "timestamp": "2026-03-09T12:50:41+01:00",
          "tree_id": "d1ab9e1d688ff93cf2ff85317a730cafa4c2f2fa",
          "url": "https://github.com/TanStack/router/commit/2f35f933124740f06c08bceb5c0004abb3e1f1d7"
        },
        "date": 1773057184215,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 88925,
            "unit": "bytes",
            "extra": "raw=279895; brotli=77249"
          },
          {
            "name": "react-router.full",
            "value": 92039,
            "unit": "bytes",
            "extra": "raw=290478; brotli=80059"
          },
          {
            "name": "solid-router.minimal",
            "value": 37041,
            "unit": "bytes",
            "extra": "raw=111044; brotli=33269"
          },
          {
            "name": "solid-router.full",
            "value": 41472,
            "unit": "bytes",
            "extra": "raw=124407; brotli=37269"
          },
          {
            "name": "vue-router.minimal",
            "value": 53283,
            "unit": "bytes",
            "extra": "raw=151981; brotli=47830"
          },
          {
            "name": "vue-router.full",
            "value": 58210,
            "unit": "bytes",
            "extra": "raw=167943; brotli=52265"
          },
          {
            "name": "react-start.minimal",
            "value": 101787,
            "unit": "bytes",
            "extra": "raw=319982; brotli=88042"
          },
          {
            "name": "react-start.full",
            "value": 105249,
            "unit": "bytes",
            "extra": "raw=330026; brotli=90948"
          },
          {
            "name": "solid-start.minimal",
            "value": 49656,
            "unit": "bytes",
            "extra": "raw=149537; brotli=43874"
          },
          {
            "name": "solid-start.full",
            "value": 55257,
            "unit": "bytes",
            "extra": "raw=165865; brotli=48649"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "31ed0a96489fed5b3ce63e6498094a2583e1180f",
          "message": "fix: don't re-execute stale loaders on unrelated location changes (#6867)\n\n* fix: don't re-execute stale loaders on unrelated location changes\n\n* lint\n\n* remove loaderKeyChanged\n\n* from last\n\n* inline staleMatchShouldReload\n\n* update tests\n\n* add test\n\n* fix\n\n* revert",
          "timestamp": "2026-03-09T20:02:35+01:00",
          "tree_id": "ec26072759d63aabec3808f124f16cdf346255fd",
          "url": "https://github.com/TanStack/router/commit/31ed0a96489fed5b3ce63e6498094a2583e1180f"
        },
        "date": 1773083097072,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89095,
            "unit": "bytes",
            "extra": "raw=280273; brotli=77364"
          },
          {
            "name": "react-router.full",
            "value": 92163,
            "unit": "bytes",
            "extra": "raw=290773; brotli=80247"
          },
          {
            "name": "solid-router.minimal",
            "value": 37187,
            "unit": "bytes",
            "extra": "raw=111425; brotli=33417"
          },
          {
            "name": "solid-router.full",
            "value": 41582,
            "unit": "bytes",
            "extra": "raw=124708; brotli=37340"
          },
          {
            "name": "vue-router.minimal",
            "value": 53418,
            "unit": "bytes",
            "extra": "raw=152407; brotli=48049"
          },
          {
            "name": "vue-router.full",
            "value": 58329,
            "unit": "bytes",
            "extra": "raw=168287; brotli=52336"
          },
          {
            "name": "react-start.minimal",
            "value": 101930,
            "unit": "bytes",
            "extra": "raw=320363; brotli=88174"
          },
          {
            "name": "react-start.full",
            "value": 105365,
            "unit": "bytes",
            "extra": "raw=330325; brotli=91117"
          },
          {
            "name": "solid-start.minimal",
            "value": 49797,
            "unit": "bytes",
            "extra": "raw=149918; brotli=44107"
          },
          {
            "name": "solid-start.full",
            "value": 55390,
            "unit": "bytes",
            "extra": "raw=166164; brotli=48811"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "065e4ec11ed55e1c2e00d1a3ff65abdcd8d7cd09",
          "message": "fix(solid-router,vue-router): re-build next location on params,search,hash changes (#6865)",
          "timestamp": "2026-03-09T22:51:44+01:00",
          "tree_id": "04ff933cb42c2cec8628cb0ec017c1452e89535e",
          "url": "https://github.com/TanStack/router/commit/065e4ec11ed55e1c2e00d1a3ff65abdcd8d7cd09"
        },
        "date": 1773093252118,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89095,
            "unit": "bytes",
            "extra": "raw=280273; brotli=77364"
          },
          {
            "name": "react-router.full",
            "value": 92163,
            "unit": "bytes",
            "extra": "raw=290773; brotli=80247"
          },
          {
            "name": "solid-router.minimal",
            "value": 37216,
            "unit": "bytes",
            "extra": "raw=111507; brotli=33484"
          },
          {
            "name": "solid-router.full",
            "value": 41614,
            "unit": "bytes",
            "extra": "raw=124790; brotli=37377"
          },
          {
            "name": "vue-router.minimal",
            "value": 53446,
            "unit": "bytes",
            "extra": "raw=152512; brotli=47963"
          },
          {
            "name": "vue-router.full",
            "value": 58359,
            "unit": "bytes",
            "extra": "raw=168392; brotli=52409"
          },
          {
            "name": "react-start.minimal",
            "value": 101930,
            "unit": "bytes",
            "extra": "raw=320363; brotli=88174"
          },
          {
            "name": "react-start.full",
            "value": 105365,
            "unit": "bytes",
            "extra": "raw=330325; brotli=91117"
          },
          {
            "name": "solid-start.minimal",
            "value": 49815,
            "unit": "bytes",
            "extra": "raw=150000; brotli=44082"
          },
          {
            "name": "solid-start.full",
            "value": 55406,
            "unit": "bytes",
            "extra": "raw=166246; brotli=48874"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b7def82c7d9ecd844f88a9e355de9b9874ebe750",
          "message": "fix: ensure lazy error component is preloaded (#6875)",
          "timestamp": "2026-03-09T23:04:09+01:00",
          "tree_id": "ad9fa0a3d33e1511f502da1e49327ef110364d14",
          "url": "https://github.com/TanStack/router/commit/b7def82c7d9ecd844f88a9e355de9b9874ebe750"
        },
        "date": 1773094085176,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89158,
            "unit": "bytes",
            "extra": "raw=280394; brotli=77546"
          },
          {
            "name": "react-router.full",
            "value": 92181,
            "unit": "bytes",
            "extra": "raw=290894; brotli=80157"
          },
          {
            "name": "solid-router.minimal",
            "value": 37261,
            "unit": "bytes",
            "extra": "raw=111626; brotli=33441"
          },
          {
            "name": "solid-router.full",
            "value": 41677,
            "unit": "bytes",
            "extra": "raw=124909; brotli=37337"
          },
          {
            "name": "vue-router.minimal",
            "value": 53497,
            "unit": "bytes",
            "extra": "raw=152633; brotli=48024"
          },
          {
            "name": "vue-router.full",
            "value": 58409,
            "unit": "bytes",
            "extra": "raw=168513; brotli=52461"
          },
          {
            "name": "react-start.minimal",
            "value": 102020,
            "unit": "bytes",
            "extra": "raw=320484; brotli=88213"
          },
          {
            "name": "react-start.full",
            "value": 105395,
            "unit": "bytes",
            "extra": "raw=330446; brotli=91178"
          },
          {
            "name": "solid-start.minimal",
            "value": 49867,
            "unit": "bytes",
            "extra": "raw=150120; brotli=44132"
          },
          {
            "name": "solid-start.full",
            "value": 55465,
            "unit": "bytes",
            "extra": "raw=166366; brotli=48910"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d306d58a21165dd51403d78acab815d744103bd5",
          "message": "chore(eslint): remove package-level unused-vars overrides (#6782)",
          "timestamp": "2026-03-10T00:09:44+01:00",
          "tree_id": "7766db2c0fd1517f1eee18067ea0aad9df308d4f",
          "url": "https://github.com/TanStack/router/commit/d306d58a21165dd51403d78acab815d744103bd5"
        },
        "date": 1773097923775,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89158,
            "unit": "bytes",
            "extra": "raw=280394; brotli=77546"
          },
          {
            "name": "react-router.full",
            "value": 92181,
            "unit": "bytes",
            "extra": "raw=290894; brotli=80157"
          },
          {
            "name": "solid-router.minimal",
            "value": 37261,
            "unit": "bytes",
            "extra": "raw=111626; brotli=33441"
          },
          {
            "name": "solid-router.full",
            "value": 41677,
            "unit": "bytes",
            "extra": "raw=124909; brotli=37337"
          },
          {
            "name": "vue-router.minimal",
            "value": 53497,
            "unit": "bytes",
            "extra": "raw=152633; brotli=48024"
          },
          {
            "name": "vue-router.full",
            "value": 58409,
            "unit": "bytes",
            "extra": "raw=168513; brotli=52461"
          },
          {
            "name": "react-start.minimal",
            "value": 102020,
            "unit": "bytes",
            "extra": "raw=320484; brotli=88213"
          },
          {
            "name": "react-start.full",
            "value": 105395,
            "unit": "bytes",
            "extra": "raw=330446; brotli=91178"
          },
          {
            "name": "solid-start.minimal",
            "value": 49867,
            "unit": "bytes",
            "extra": "raw=150120; brotli=44132"
          },
          {
            "name": "solid-start.full",
            "value": 55465,
            "unit": "bytes",
            "extra": "raw=166366; brotli=48910"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "dadf7e9d9d013872a817729b73e396d8929c08a6",
          "message": "fix(router-core): null prototype input/output objects (#6882)",
          "timestamp": "2026-03-10T20:22:35+01:00",
          "tree_id": "089601cedd350ca87dde8d74d9df99a43bf1d608",
          "url": "https://github.com/TanStack/router/commit/dadf7e9d9d013872a817729b73e396d8929c08a6"
        },
        "date": 1773170692620,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "97cee95647762dbace3b3533ede4a56492078c00",
          "message": "Migrate repo to changesets (#6837)",
          "timestamp": "2026-03-11T00:00:51+01:00",
          "tree_id": "af6080165e0a73e44e19737f09469d1becabf47c",
          "url": "https://github.com/TanStack/router/commit/97cee95647762dbace3b3533ede4a56492078c00"
        },
        "date": 1773183796449,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "sleitor@list.ru",
            "name": "Dmitrii",
            "username": "sleitor"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "870cf28066954b17e551c4e0f6627e382f0d6a57",
          "message": "chore(examples): remove stale delay slider reference from with-trpc example (#6876)\n\n* fix(examples): remove stale delay slider reference from with-trpc example\n\n* fix(examples): also remove preload state slider text from with-trpc example\n\n---------\n\nCo-authored-by: sleitor <sleitor@users.noreply.github.com>\nCo-authored-by: Dmitrii Troitskii <jsleitor@gmail.com>",
          "timestamp": "2026-03-11T12:50:31+13:00",
          "tree_id": "204f17e28779fe2c165aba5f774dd56ba8a68025",
          "url": "https://github.com/TanStack/router/commit/870cf28066954b17e551c4e0f6627e382f0d6a57"
        },
        "date": 1773186769859,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "044fb24d265659d4b895f5b23a314e3a22c26564",
          "message": "auto update workspace deps used in examples (#6892)",
          "timestamp": "2026-03-11T19:40:41+01:00",
          "tree_id": "e8b7edeb1a52066f120434b9b73335dcafd82a8d",
          "url": "https://github.com/TanStack/router/commit/044fb24d265659d4b895f5b23a314e3a22c26564"
        },
        "date": 1773254614721,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ab46b5ec42296c60dc46d97481f038b8df68ed84",
          "message": "automatic github releases creation from changeset (#6894)",
          "timestamp": "2026-03-11T20:14:43+01:00",
          "tree_id": "c0d0c123f1e29a200effbdae4eac187f06e003da",
          "url": "https://github.com/TanStack/router/commit/ab46b5ec42296c60dc46d97481f038b8df68ed84"
        },
        "date": 1773256804660,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9a4d924d2b60ffb0f7f3f8f11c95195222929870",
          "message": "fix: keep CSS when referenced both statically and dynamically (#6891)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-03-11T20:30:18+01:00",
          "tree_id": "f15a50a6812c38313ef4eed0947aa21a59e68cef",
          "url": "https://github.com/TanStack/router/commit/9a4d924d2b60ffb0f7f3f8f11c95195222929870"
        },
        "date": 1773257807460,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bb291c68aaf63cd57406f14d382abc4d1c5456f3",
          "message": "improve github release changelog (#6897)",
          "timestamp": "2026-03-11T21:55:41+01:00",
          "tree_id": "0c7f9b1d174d96a9affebd869ba991a966f983d0",
          "url": "https://github.com/TanStack/router/commit/bb291c68aaf63cd57406f14d382abc4d1c5456f3"
        },
        "date": 1773262676199,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9f2795a779aa080fc52ae3557530346e05562198",
          "message": "fix: resolve author from PR links in GitHub release changelog (#6898)",
          "timestamp": "2026-03-11T22:00:24+01:00",
          "tree_id": "3901e180d2156bf6d66c7f95362d0de2628e5c87",
          "url": "https://github.com/TanStack/router/commit/9f2795a779aa080fc52ae3557530346e05562198"
        },
        "date": 1773262971210,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "576b5acd874f0a7fa11b0cbd8186eb7448268b09",
          "message": "chore: tweak prerelease flow (#6906)",
          "timestamp": "2026-03-12T17:37:35+01:00",
          "tree_id": "11024bac5f673be10fd233e2f523e24fae9f43ef",
          "url": "https://github.com/TanStack/router/commit/576b5acd874f0a7fa11b0cbd8186eb7448268b09"
        },
        "date": 1773333600008,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "daa2ab9886f857b0e6b6299aec3787e6f92b6003",
          "message": "use semantic commit for improved github release changelog (#6909)",
          "timestamp": "2026-03-12T21:47:17+01:00",
          "tree_id": "de1395294d889197a01101260308bb6736c5567b",
          "url": "https://github.com/TanStack/router/commit/daa2ab9886f857b0e6b6299aec3787e6f92b6003"
        },
        "date": 1773348585167,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "1667261+lachlancollins@users.noreply.github.com",
            "name": "Lachlan Collins",
            "username": "lachlancollins"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "77bd44dee5496f93cc7a862691f32cbee4f4d2fb",
          "message": "ci: fix changesets experimental options (#6912)",
          "timestamp": "2026-03-13T09:53:14+11:00",
          "tree_id": "9c894b4484ddcc08b777516e10a368a80f3d05ce",
          "url": "https://github.com/TanStack/router/commit/77bd44dee5496f93cc7a862691f32cbee4f4d2fb"
        },
        "date": 1773356139276,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6da5c64100a2a3be3bed7bd1d9dedd39994901e1",
          "message": "fix(start-static-server-functions): adjust start peerDeps to workspace:^ (#6913)",
          "timestamp": "2026-03-13T00:42:42+01:00",
          "tree_id": "6eea259ae09bde43dfa8cde9d4e815071d527903",
          "url": "https://github.com/TanStack/router/commit/6da5c64100a2a3be3bed7bd1d9dedd39994901e1"
        },
        "date": 1773359102856,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4e465e93b3d0169ed7b2f9d1a7ccb1c5414b7161",
          "message": "ci: only include 'feat', 'fix', 'perf', 'refactor' in changelog (#6914)",
          "timestamp": "2026-03-13T01:05:11+01:00",
          "tree_id": "63cc1e26cf29c038de974f5ed3222f6e2322d673",
          "url": "https://github.com/TanStack/router/commit/4e465e93b3d0169ed7b2f9d1a7ccb1c5414b7161"
        },
        "date": 1773360457139,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "32497be9c8fc1c283b876d742deaf5d3bf5f2669",
          "message": "test: migrate lint from tanstack/config to tanstack/eslint-config (#6915)",
          "timestamp": "2026-03-13T03:02:00+01:00",
          "tree_id": "1aeba2cfe643c104b5634c49e5e07b66d74734be",
          "url": "https://github.com/TanStack/router/commit/32497be9c8fc1c283b876d742deaf5d3bf5f2669"
        },
        "date": 1773367456177,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nat@nize.ph",
            "name": "Nathaniel John Tampus",
            "username": "dotnize"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ee3d2bdce3fd4a651b55ac65395afe05f7a1378f",
          "message": "docs(start): update path aliases config for Vite 8 (#6918)",
          "timestamp": "2026-03-14T07:52:42+13:00",
          "tree_id": "92c47a804dd4ced23459e6b503443900919d1d1b",
          "url": "https://github.com/TanStack/router/commit/ee3d2bdce3fd4a651b55ac65395afe05f7a1378f"
        },
        "date": 1773428107598,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santosh.yadav198613@gmail.com",
            "name": "Santosh Yadav",
            "username": "santoshyadavdev"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "80c3196246952c437c4ed8cf892b293800e24f3b",
          "message": "docs: fix partner logos in README (#6908)",
          "timestamp": "2026-03-14T08:02:21+13:00",
          "tree_id": "af87411c6fc5c31f6b0c9a9efbec015803da58c1",
          "url": "https://github.com/TanStack/router/commit/80c3196246952c437c4ed8cf892b293800e24f3b"
        },
        "date": 1773428824189,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89180,
            "unit": "bytes",
            "extra": "raw=280686; brotli=77499"
          },
          {
            "name": "react-router.full",
            "value": 92238,
            "unit": "bytes",
            "extra": "raw=291186; brotli=80199"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102052,
            "unit": "bytes",
            "extra": "raw=320776; brotli=88290"
          },
          {
            "name": "react-start.full",
            "value": 105442,
            "unit": "bytes",
            "extra": "raw=330738; brotli=91203"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6069eba64369dbddb0d8dccdb4407f0e1a82259e",
          "message": "fix: hoist inline component definitions for proper React HMR (#6919)\n\n* fix: hoist inline component definitions for proper React HMR\n\nthis reverts #6197 and implements a proper fix\n\nfixes #6339\n\n* add changeset",
          "timestamp": "2026-03-13T21:24:40+01:00",
          "tree_id": "a3602692b13b3f0c4fb1b0840f72ec9f005bbe69",
          "url": "https://github.com/TanStack/router/commit/6069eba64369dbddb0d8dccdb4407f0e1a82259e"
        },
        "date": 1773433620167,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89175,
            "unit": "bytes",
            "extra": "raw=280668; brotli=77537"
          },
          {
            "name": "react-router.full",
            "value": 92232,
            "unit": "bytes",
            "extra": "raw=291168; brotli=80219"
          },
          {
            "name": "solid-router.minimal",
            "value": 37299,
            "unit": "bytes",
            "extra": "raw=111917; brotli=33523"
          },
          {
            "name": "solid-router.full",
            "value": 41724,
            "unit": "bytes",
            "extra": "raw=125200; brotli=37454"
          },
          {
            "name": "vue-router.minimal",
            "value": 53541,
            "unit": "bytes",
            "extra": "raw=152925; brotli=48142"
          },
          {
            "name": "vue-router.full",
            "value": 58446,
            "unit": "bytes",
            "extra": "raw=168805; brotli=52504"
          },
          {
            "name": "react-start.minimal",
            "value": 102044,
            "unit": "bytes",
            "extra": "raw=320758; brotli=88321"
          },
          {
            "name": "react-start.full",
            "value": 105437,
            "unit": "bytes",
            "extra": "raw=330720; brotli=91200"
          },
          {
            "name": "solid-start.minimal",
            "value": 49923,
            "unit": "bytes",
            "extra": "raw=150412; brotli=44175"
          },
          {
            "name": "solid-start.full",
            "value": 55515,
            "unit": "bytes",
            "extra": "raw=166658; brotli=49024"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6f297a249424c0fd1c1a56aa4fc12c8217be7b6a",
          "message": "feat: add staleReloadMode (#6921)\n\n* feat: add staleReloadMode\n\n* update\n\n* ci: apply automated fixes\n\n---------\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-03-14T08:41:38+01:00",
          "tree_id": "2d78f49215697852b3f6bd4f4f368cd440f87b6b",
          "url": "https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a"
        },
        "date": 1773474239445,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "114827586+autofix-ci[bot]@users.noreply.github.com",
            "name": "autofix-ci[bot]",
            "username": "autofix-ci[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9db44632280c9e20cd90d26300cdac26226defb7",
          "message": "ci: apply automated fixes",
          "timestamp": "2026-03-14T07:48:35Z",
          "tree_id": "e5a374afe323666cff956927cbe0a231ec814432",
          "url": "https://github.com/TanStack/router/commit/9db44632280c9e20cd90d26300cdac26226defb7"
        },
        "date": 1773474672981,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nat@nize.ph",
            "name": "Nathaniel John Tampus",
            "username": "dotnize"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e2811d39f6121e18fff6706db1d592495936d84e",
          "message": "docs(start): update Nitro instructions for v3 beta (#6896)\n\n* docs: update Nitro instructions for v3 beta\n\n* docs: move nitro to dev dependencies\n\n* Apply @seancassiere suggestions from code review\n\nCo-authored-by: Sean Cassiere <33615041+SeanCassiere@users.noreply.github.com>\n\n---------\n\nCo-authored-by: Sean Cassiere <33615041+SeanCassiere@users.noreply.github.com>",
          "timestamp": "2026-03-14T22:52:56+13:00",
          "tree_id": "76dee7920797189c9c95729e291c7ff3d82d665d",
          "url": "https://github.com/TanStack/router/commit/e2811d39f6121e18fff6706db1d592495936d84e"
        },
        "date": 1773482124448,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "33615041+SeanCassiere@users.noreply.github.com",
            "name": "SeanCassiere",
            "username": "SeanCassiere"
          },
          "committer": {
            "email": "33615041+SeanCassiere@users.noreply.github.com",
            "name": "SeanCassiere",
            "username": "SeanCassiere"
          },
          "distinct": true,
          "id": "773c7c9cb9c17646020286a2d8721e2f0b628f8c",
          "message": "chore: generate route-tree for all sandboxes\na recent change to generator, meant that all the sandboxes had their route-trees files being out-of-date",
          "timestamp": "2026-03-14T23:28:51+13:00",
          "tree_id": "59a35382967c5ce7aaaee60631a15b39e337c22a",
          "url": "https://github.com/TanStack/router/commit/773c7c9cb9c17646020286a2d8721e2f0b628f8c"
        },
        "date": 1773484277942,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "caweidmann.dev@gmail.com",
            "name": "Cornelius",
            "username": "caweidmann"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bb122e03796300572e1118ef282d13109d791e49",
          "message": "docs: Update README for translated pathnames (#6888)",
          "timestamp": "2026-03-14T13:08:19+02:00",
          "tree_id": "3268b192bba90ad1d684e9f5e8add8ea81bfebd4",
          "url": "https://github.com/TanStack/router/commit/bb122e03796300572e1118ef282d13109d791e49"
        },
        "date": 1773486655424,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "113988347+s0h311@users.noreply.github.com",
            "name": "Soheil",
            "username": "s0h311"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "29c0201441b58a8f143baf338be9827bf186444f",
          "message": "docs: import defaultRenderHandler instead of renderRouterToString in … (#6776)\n\ndocs: import defaultRenderHandler instead of renderRouterToString in ssr.md \n\nexample using defaultRenderHandler imports renderRouterToString instead of defaultRenderHandler\n\nCo-authored-by: Nico Lynzaad <44094871+nlynzaad@users.noreply.github.com>",
          "timestamp": "2026-03-14T13:31:45+02:00",
          "tree_id": "762ba71607ac03b8de56852b718f6a68e2445756",
          "url": "https://github.com/TanStack/router/commit/29c0201441b58a8f143baf338be9827bf186444f"
        },
        "date": 1773488050233,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "birk.skyum@pm.me",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "birk.skyum@pm.me",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "distinct": true,
          "id": "215cab47e8b93a7091cff634e64db1747c4e1e3c",
          "message": "chore: inlcude build in github changelog",
          "timestamp": "2026-03-15T00:50:04+01:00",
          "tree_id": "cc5e1f00d7625e2dd5c2dfb2cd503dddecf8f893",
          "url": "https://github.com/TanStack/router/commit/215cab47e8b93a7091cff634e64db1747c4e1e3c"
        },
        "date": 1773532353150,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102105,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88282"
          },
          {
            "name": "react-start.full",
            "value": 105492,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91219"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ef9b241f3cfe95cee40daa96da669f0ffd4a971a",
          "message": "build: update to @tanstack/vite-config v0.4.3 (#6923)\n\n* move to vite-config 0.4.3\n\n* changeset\n\n* fix typo in the changeset\n\n* patch vite-config to use module: 100\n\n* Update patch file\n\n* Fix lockfile\n\n---------\n\nCo-authored-by: Lachlan Collins <1667261+lachlancollins@users.noreply.github.com>",
          "timestamp": "2026-03-16T02:27:24+11:00",
          "tree_id": "002ce0ea0d53e4f8a4f4479e539dd08a43f32b04",
          "url": "https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a"
        },
        "date": 1773588580892,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102101,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88258"
          },
          {
            "name": "react-start.full",
            "value": 105491,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91245"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "zougarii.ahmed@gmail.com",
            "name": "Ahmed Zougari",
            "username": "zougari47"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ac775f5dee67b9d77e448918d0144f9e575a253e",
          "message": "docs: remove react-oxc plugin suggestion(deprecated) (#6927)",
          "timestamp": "2026-03-15T22:02:42+01:00",
          "tree_id": "f63447f635a00397ccbb281e5831c4a3d3b2326b",
          "url": "https://github.com/TanStack/router/commit/ac775f5dee67b9d77e448918d0144f9e575a253e"
        },
        "date": 1773608709596,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89221,
            "unit": "bytes",
            "extra": "raw=280804; brotli=77582"
          },
          {
            "name": "react-router.full",
            "value": 92294,
            "unit": "bytes",
            "extra": "raw=291304; brotli=80318"
          },
          {
            "name": "solid-router.minimal",
            "value": 37357,
            "unit": "bytes",
            "extra": "raw=112053; brotli=33594"
          },
          {
            "name": "solid-router.full",
            "value": 41777,
            "unit": "bytes",
            "extra": "raw=125336; brotli=37543"
          },
          {
            "name": "vue-router.minimal",
            "value": 53602,
            "unit": "bytes",
            "extra": "raw=153061; brotli=48147"
          },
          {
            "name": "vue-router.full",
            "value": 58509,
            "unit": "bytes",
            "extra": "raw=168941; brotli=52494"
          },
          {
            "name": "react-start.minimal",
            "value": 102101,
            "unit": "bytes",
            "extra": "raw=320894; brotli=88258"
          },
          {
            "name": "react-start.full",
            "value": 105491,
            "unit": "bytes",
            "extra": "raw=330856; brotli=91245"
          },
          {
            "name": "solid-start.minimal",
            "value": 49966,
            "unit": "bytes",
            "extra": "raw=150548; brotli=44170"
          },
          {
            "name": "solid-start.full",
            "value": 55567,
            "unit": "bytes",
            "extra": "raw=166794; brotli=48960"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "838b0eb9a8bbbb987a0a6972c1446e01423bbd7b",
          "message": "build: update to vite-config 0.5.x (rolldown) (#6926)",
          "timestamp": "2026-03-15T23:39:00+01:00",
          "tree_id": "763434c634ad4850dd76d5ffef2ce42a434f60d8",
          "url": "https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b"
        },
        "date": 1773614663944,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89696,
            "unit": "bytes",
            "extra": "raw=282599; brotli=77971"
          },
          {
            "name": "react-router.full",
            "value": 92807,
            "unit": "bytes",
            "extra": "raw=293061; brotli=80538"
          },
          {
            "name": "solid-router.minimal",
            "value": 38012,
            "unit": "bytes",
            "extra": "raw=113955; brotli=34107"
          },
          {
            "name": "solid-router.full",
            "value": 42333,
            "unit": "bytes",
            "extra": "raw=127065; brotli=37873"
          },
          {
            "name": "vue-router.minimal",
            "value": 54235,
            "unit": "bytes",
            "extra": "raw=154950; brotli=48810"
          },
          {
            "name": "vue-router.full",
            "value": 59052,
            "unit": "bytes",
            "extra": "raw=170237; brotli=52957"
          },
          {
            "name": "react-start.minimal",
            "value": 104422,
            "unit": "bytes",
            "extra": "raw=331762; brotli=90361"
          },
          {
            "name": "react-start.full",
            "value": 107847,
            "unit": "bytes",
            "extra": "raw=341806; brotli=93287"
          },
          {
            "name": "solid-start.minimal",
            "value": 52445,
            "unit": "bytes",
            "extra": "raw=161510; brotli=46263"
          },
          {
            "name": "solid-start.full",
            "value": 57874,
            "unit": "bytes",
            "extra": "raw=177381; brotli=50898"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "32fcba7b044b03f5901308b870f70b0b4910c220",
          "message": "fix: Fix retained promise refs (#6929)",
          "timestamp": "2026-03-16T00:00:40+01:00",
          "tree_id": "61952a4d79ecd2a10e9ca5c35d245e5e065302c0",
          "url": "https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220"
        },
        "date": 1773615773572,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tannerlinsley@gmail.com",
            "name": "Tanner Linsley",
            "username": "tannerlinsley"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d6371529b5ab09af7d81463a6c4082b092411967",
          "message": "fix: write static server function cache to correct output directory with Nitro (#6940)\n\n* fix: write static server function cache to correct output directory with Nitro\n\nTSS_CLIENT_OUTPUT_DIR was baked in via Vite's define at config time, before\nNitro's configEnvironment hook changed the client build.outDir. This caused\nstaticServerFnCache files to be written to dist/client/ instead of\n.output/public/.\n\n- Remove TSS_CLIENT_OUTPUT_DIR from compile-time define in start-plugin-core\n- Set it as a runtime env var in prerender.ts using the resolved output dir\n- Guard server-side cache writes on TSS_CLIENT_OUTPUT_DIR being set\n- Add e2e test for static server functions with Nitro\n\n* fix: remove dynamic Link to nonexistent route to fix tsc --noEmit",
          "timestamp": "2026-03-16T16:56:29-06:00",
          "tree_id": "030c182db2896c42cd347aaf1d40a1e896a72e21",
          "url": "https://github.com/TanStack/router/commit/d6371529b5ab09af7d81463a6c4082b092411967"
        },
        "date": 1773701949482,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6651473d028a55c70f3f54af37a12b4379b46813",
          "message": "feat(vite-plugin-core): Spport both Vite 7 (`rollupOptions`) and Vite 8 (`rolldownOptions`) (#6955)",
          "timestamp": "2026-03-17T18:35:17+01:00",
          "tree_id": "55ec9d7509173c7b493f46edcd41a64d7070856d",
          "url": "https://github.com/TanStack/router/commit/6651473d028a55c70f3f54af37a12b4379b46813"
        },
        "date": 1773769130077,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505",
          "message": "chore: bump esbuild to 0.27.4 (#6975)",
          "timestamp": "2026-03-18T18:09:49+01:00",
          "tree_id": "1d10c91ec4a8743b8d29dc718bcdcb1106fad9b1",
          "url": "https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505"
        },
        "date": 1773853929026,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e5d23ecd5c28aa592100e7344b408d67fd261c61",
          "message": "fix(router-cli): pass process.argv to yargs to fix silent CLI failure (#6981)",
          "timestamp": "2026-03-19T14:49:29+01:00",
          "tree_id": "56a03706c3e4101d630c4713298bc4c1f05d7e31",
          "url": "https://github.com/TanStack/router/commit/e5d23ecd5c28aa592100e7344b408d67fd261c61"
        },
        "date": 1773928313359,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0f585d5289c8a3b11697caa9b2aa3015d37d776e",
          "message": "fix(start-plugin-core): improve rollupOptions/rolldownOptions handling (#6985)",
          "timestamp": "2026-03-19T19:07:41+01:00",
          "tree_id": "f3054ba83a119b24db74536648f589491c28ca05",
          "url": "https://github.com/TanStack/router/commit/0f585d5289c8a3b11697caa9b2aa3015d37d776e"
        },
        "date": 1773943796290,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7f38aac99b30c32f6d105d8596447b443034b4e3",
          "message": "chore: migrate benchmarks to Vite 8 (#6986)",
          "timestamp": "2026-03-19T20:03:32+01:00",
          "tree_id": "ba14cd04c57b2c80a34f05c998ad02c92579666d",
          "url": "https://github.com/TanStack/router/commit/7f38aac99b30c32f6d105d8596447b443034b4e3"
        },
        "date": 1773947148829,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89714,
            "unit": "bytes",
            "extra": "raw=282693; brotli=77948"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=293155; brotli=80570"
          },
          {
            "name": "solid-router.minimal",
            "value": 38027,
            "unit": "bytes",
            "extra": "raw=114049; brotli=34088"
          },
          {
            "name": "solid-router.full",
            "value": 42352,
            "unit": "bytes",
            "extra": "raw=127159; brotli=38014"
          },
          {
            "name": "vue-router.minimal",
            "value": 54258,
            "unit": "bytes",
            "extra": "raw=155044; brotli=48791"
          },
          {
            "name": "vue-router.full",
            "value": 59071,
            "unit": "bytes",
            "extra": "raw=170331; brotli=52839"
          },
          {
            "name": "react-start.minimal",
            "value": 104436,
            "unit": "bytes",
            "extra": "raw=331856; brotli=90321"
          },
          {
            "name": "react-start.full",
            "value": 107863,
            "unit": "bytes",
            "extra": "raw=341900; brotli=93205"
          },
          {
            "name": "solid-start.minimal",
            "value": 52468,
            "unit": "bytes",
            "extra": "raw=161604; brotli=46364"
          },
          {
            "name": "solid-start.full",
            "value": 57888,
            "unit": "bytes",
            "extra": "raw=177475; brotli=50913"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "054523900b2ee19308e5a88417dadfc6923afe30",
          "message": "refactor: signal based reactivity (#6704)",
          "timestamp": "2026-03-20T10:33:28+01:00",
          "tree_id": "db23f5c5a4559c0834cd5ba379c3ca9a724a7bde",
          "url": "https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30"
        },
        "date": 1773999341507,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90670,
            "unit": "bytes",
            "extra": "raw=286016; brotli=78664"
          },
          {
            "name": "react-router.full",
            "value": 93912,
            "unit": "bytes",
            "extra": "raw=297002; brotli=81366"
          },
          {
            "name": "solid-router.minimal",
            "value": 36995,
            "unit": "bytes",
            "extra": "raw=111596; brotli=33186"
          },
          {
            "name": "solid-router.full",
            "value": 41446,
            "unit": "bytes",
            "extra": "raw=125006; brotli=37126"
          },
          {
            "name": "vue-router.minimal",
            "value": 55399,
            "unit": "bytes",
            "extra": "raw=158965; brotli=49645"
          },
          {
            "name": "vue-router.full",
            "value": 60289,
            "unit": "bytes",
            "extra": "raw=174481; brotli=53915"
          },
          {
            "name": "react-start.minimal",
            "value": 105454,
            "unit": "bytes",
            "extra": "raw=335233; brotli=91178"
          },
          {
            "name": "react-start.full",
            "value": 108909,
            "unit": "bytes",
            "extra": "raw=345791; brotli=94112"
          },
          {
            "name": "solid-start.minimal",
            "value": 51528,
            "unit": "bytes",
            "extra": "raw=159205; brotli=45382"
          },
          {
            "name": "solid-start.full",
            "value": 57060,
            "unit": "bytes",
            "extra": "raw=175376; brotli=50074"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "114827586+autofix-ci[bot]@users.noreply.github.com",
            "name": "autofix-ci[bot]",
            "username": "autofix-ci[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9ae24efcd5f6d5f77a2ee78f6d4663ce98dab14c",
          "message": "ci: apply automated fixes",
          "timestamp": "2026-03-20T10:04:10Z",
          "tree_id": "1dca4c9004cc29a5ddda6daa436750142efe0131",
          "url": "https://github.com/TanStack/router/commit/9ae24efcd5f6d5f77a2ee78f6d4663ce98dab14c"
        },
        "date": 1774001196860,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90670,
            "unit": "bytes",
            "extra": "raw=286016; brotli=78664"
          },
          {
            "name": "react-router.full",
            "value": 93912,
            "unit": "bytes",
            "extra": "raw=297002; brotli=81366"
          },
          {
            "name": "solid-router.minimal",
            "value": 36995,
            "unit": "bytes",
            "extra": "raw=111596; brotli=33186"
          },
          {
            "name": "solid-router.full",
            "value": 41446,
            "unit": "bytes",
            "extra": "raw=125006; brotli=37126"
          },
          {
            "name": "vue-router.minimal",
            "value": 55399,
            "unit": "bytes",
            "extra": "raw=158965; brotli=49645"
          },
          {
            "name": "vue-router.full",
            "value": 60289,
            "unit": "bytes",
            "extra": "raw=174481; brotli=53915"
          },
          {
            "name": "react-start.minimal",
            "value": 105454,
            "unit": "bytes",
            "extra": "raw=335233; brotli=91178"
          },
          {
            "name": "react-start.full",
            "value": 108909,
            "unit": "bytes",
            "extra": "raw=345791; brotli=94112"
          },
          {
            "name": "solid-start.minimal",
            "value": 51528,
            "unit": "bytes",
            "extra": "raw=159205; brotli=45382"
          },
          {
            "name": "solid-start.full",
            "value": 57060,
            "unit": "bytes",
            "extra": "raw=175376; brotli=50074"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "91cc62899b75ca920fe83c5ee7f3dbb5c71a523f",
          "message": "chore: update TanStack store packages to 0.9.2 (#6993)",
          "timestamp": "2026-03-20T11:33:30+01:00",
          "tree_id": "4572444b841c7bffe5830255f49f2750241ad9f4",
          "url": "https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f"
        },
        "date": 1774002953806,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90682,
            "unit": "bytes",
            "extra": "raw=286049; brotli=78682"
          },
          {
            "name": "react-router.full",
            "value": 93928,
            "unit": "bytes",
            "extra": "raw=297035; brotli=81392"
          },
          {
            "name": "solid-router.minimal",
            "value": 36995,
            "unit": "bytes",
            "extra": "raw=111596; brotli=33186"
          },
          {
            "name": "solid-router.full",
            "value": 41446,
            "unit": "bytes",
            "extra": "raw=125006; brotli=37126"
          },
          {
            "name": "vue-router.minimal",
            "value": 55410,
            "unit": "bytes",
            "extra": "raw=158998; brotli=49648"
          },
          {
            "name": "vue-router.full",
            "value": 60301,
            "unit": "bytes",
            "extra": "raw=174514; brotli=53892"
          },
          {
            "name": "react-start.minimal",
            "value": 105471,
            "unit": "bytes",
            "extra": "raw=335266; brotli=91154"
          },
          {
            "name": "react-start.full",
            "value": 108922,
            "unit": "bytes",
            "extra": "raw=345824; brotli=94032"
          },
          {
            "name": "solid-start.minimal",
            "value": 51528,
            "unit": "bytes",
            "extra": "raw=159205; brotli=45382"
          },
          {
            "name": "solid-start.full",
            "value": 57060,
            "unit": "bytes",
            "extra": "raw=175376; brotli=50074"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9351e997962d02ecc3f6f1791edd84e64361d27b",
          "message": "fix: Fix React Fast Refresh state preservation for auto code-split ro… (#7000)",
          "timestamp": "2026-03-21T01:27:50+01:00",
          "tree_id": "ceb1995a888d3fc1ad214ed7b0d8ea112dd890fa",
          "url": "https://github.com/TanStack/router/commit/9351e997962d02ecc3f6f1791edd84e64361d27b"
        },
        "date": 1774053003093,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90682,
            "unit": "bytes",
            "extra": "raw=286049; brotli=78682"
          },
          {
            "name": "react-router.full",
            "value": 93928,
            "unit": "bytes",
            "extra": "raw=297035; brotli=81392"
          },
          {
            "name": "solid-router.minimal",
            "value": 36995,
            "unit": "bytes",
            "extra": "raw=111596; brotli=33186"
          },
          {
            "name": "solid-router.full",
            "value": 41446,
            "unit": "bytes",
            "extra": "raw=125006; brotli=37126"
          },
          {
            "name": "vue-router.minimal",
            "value": 55410,
            "unit": "bytes",
            "extra": "raw=158998; brotli=49648"
          },
          {
            "name": "vue-router.full",
            "value": 60301,
            "unit": "bytes",
            "extra": "raw=174514; brotli=53892"
          },
          {
            "name": "react-start.minimal",
            "value": 105471,
            "unit": "bytes",
            "extra": "raw=335266; brotli=91154"
          },
          {
            "name": "react-start.full",
            "value": 108922,
            "unit": "bytes",
            "extra": "raw=345824; brotli=94032"
          },
          {
            "name": "solid-start.minimal",
            "value": 51528,
            "unit": "bytes",
            "extra": "raw=159205; brotli=45382"
          },
          {
            "name": "solid-start.full",
            "value": 57060,
            "unit": "bytes",
            "extra": "raw=175376; brotli=50074"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0d11d5e494bbf2a52110bf950bb3d694e1b77285",
          "message": "fix(solid-router): avoid HeadContent remounts on history.replaceState (#6998)",
          "timestamp": "2026-03-21T07:01:05+01:00",
          "tree_id": "685a2fedded71c9f14e8d0d44b6d32fe1fed230f",
          "url": "https://github.com/TanStack/router/commit/0d11d5e494bbf2a52110bf950bb3d694e1b77285"
        },
        "date": 1774072995213,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90682,
            "unit": "bytes",
            "extra": "raw=286049; brotli=78682"
          },
          {
            "name": "react-router.full",
            "value": 93928,
            "unit": "bytes",
            "extra": "raw=297035; brotli=81392"
          },
          {
            "name": "solid-router.minimal",
            "value": 36995,
            "unit": "bytes",
            "extra": "raw=111596; brotli=33186"
          },
          {
            "name": "solid-router.full",
            "value": 41461,
            "unit": "bytes",
            "extra": "raw=125047; brotli=37115"
          },
          {
            "name": "vue-router.minimal",
            "value": 55410,
            "unit": "bytes",
            "extra": "raw=158998; brotli=49648"
          },
          {
            "name": "vue-router.full",
            "value": 60301,
            "unit": "bytes",
            "extra": "raw=174514; brotli=53892"
          },
          {
            "name": "react-start.minimal",
            "value": 105471,
            "unit": "bytes",
            "extra": "raw=335266; brotli=91154"
          },
          {
            "name": "react-start.full",
            "value": 108922,
            "unit": "bytes",
            "extra": "raw=345824; brotli=94032"
          },
          {
            "name": "solid-start.minimal",
            "value": 51528,
            "unit": "bytes",
            "extra": "raw=159205; brotli=45382"
          },
          {
            "name": "solid-start.full",
            "value": 57072,
            "unit": "bytes",
            "extra": "raw=175417; brotli=50112"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d7445e048d7dbc0c3455eb7af2c18938186468e1",
          "message": "fix: better react HMR (#7005)\n\n* fix: better react HMR\n\n* layout and fixes\n\n* fix\n\n* stabilize test\n\n* stabilize test",
          "timestamp": "2026-03-21T18:06:31+01:00",
          "tree_id": "3e364df3d7f22e287cc8f8101567664af0609184",
          "url": "https://github.com/TanStack/router/commit/d7445e048d7dbc0c3455eb7af2c18938186468e1"
        },
        "date": 1774112923466,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90670,
            "unit": "bytes",
            "extra": "raw=285932; brotli=78750"
          },
          {
            "name": "react-router.full",
            "value": 93914,
            "unit": "bytes",
            "extra": "raw=296918; brotli=81431"
          },
          {
            "name": "solid-router.minimal",
            "value": 36995,
            "unit": "bytes",
            "extra": "raw=111596; brotli=33186"
          },
          {
            "name": "solid-router.full",
            "value": 41461,
            "unit": "bytes",
            "extra": "raw=125047; brotli=37115"
          },
          {
            "name": "vue-router.minimal",
            "value": 55410,
            "unit": "bytes",
            "extra": "raw=158998; brotli=49648"
          },
          {
            "name": "vue-router.full",
            "value": 60301,
            "unit": "bytes",
            "extra": "raw=174514; brotli=53892"
          },
          {
            "name": "react-start.minimal",
            "value": 105451,
            "unit": "bytes",
            "extra": "raw=335149; brotli=91087"
          },
          {
            "name": "react-start.full",
            "value": 108903,
            "unit": "bytes",
            "extra": "raw=345707; brotli=94113"
          },
          {
            "name": "solid-start.minimal",
            "value": 51528,
            "unit": "bytes",
            "extra": "raw=159205; brotli=45382"
          },
          {
            "name": "solid-start.full",
            "value": 57072,
            "unit": "bytes",
            "extra": "raw=175417; brotli=50112"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c9e18555f3a5531e96de8f574cfca9edcdb18e5c",
          "message": "fix: strip invariant and warning strings from prod bundles (#7007)",
          "timestamp": "2026-03-22T10:27:08+01:00",
          "tree_id": "50c4304745a59543faa50c9dc44cc11b958772c6",
          "url": "https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c"
        },
        "date": 1774171768554,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90269,
            "unit": "bytes",
            "extra": "raw=285043; brotli=78395"
          },
          {
            "name": "react-router.full",
            "value": 93499,
            "unit": "bytes",
            "extra": "raw=296029; brotli=81125"
          },
          {
            "name": "solid-router.minimal",
            "value": 36656,
            "unit": "bytes",
            "extra": "raw=110861; brotli=32847"
          },
          {
            "name": "solid-router.full",
            "value": 41111,
            "unit": "bytes",
            "extra": "raw=124312; brotli=36796"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 59955,
            "unit": "bytes",
            "extra": "raw=173716; brotli=53570"
          },
          {
            "name": "react-start.minimal",
            "value": 104896,
            "unit": "bytes",
            "extra": "raw=333945; brotli=90738"
          },
          {
            "name": "react-start.full",
            "value": 108397,
            "unit": "bytes",
            "extra": "raw=344505; brotli=93673"
          },
          {
            "name": "solid-start.minimal",
            "value": 51064,
            "unit": "bytes",
            "extra": "raw=158157; brotli=44987"
          },
          {
            "name": "solid-start.full",
            "value": 56583,
            "unit": "bytes",
            "extra": "raw=174369; brotli=49691"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b9f9ea15b69648b4aabffc43cd7e9b7c3636f20b",
          "message": "test: broaden client-nav benchmark coverage (#7010)",
          "timestamp": "2026-03-22T13:10:11+01:00",
          "tree_id": "6ccec941c405ee80f7df53fa3394bc3d1584e032",
          "url": "https://github.com/TanStack/router/commit/b9f9ea15b69648b4aabffc43cd7e9b7c3636f20b"
        },
        "date": 1774181552846,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90269,
            "unit": "bytes",
            "extra": "raw=285043; brotli=78395"
          },
          {
            "name": "react-router.full",
            "value": 93499,
            "unit": "bytes",
            "extra": "raw=296029; brotli=81125"
          },
          {
            "name": "solid-router.minimal",
            "value": 36656,
            "unit": "bytes",
            "extra": "raw=110861; brotli=32847"
          },
          {
            "name": "solid-router.full",
            "value": 41111,
            "unit": "bytes",
            "extra": "raw=124312; brotli=36796"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 59955,
            "unit": "bytes",
            "extra": "raw=173716; brotli=53570"
          },
          {
            "name": "react-start.minimal",
            "value": 104896,
            "unit": "bytes",
            "extra": "raw=333945; brotli=90738"
          },
          {
            "name": "react-start.full",
            "value": 108397,
            "unit": "bytes",
            "extra": "raw=344505; brotli=93673"
          },
          {
            "name": "solid-start.minimal",
            "value": 51064,
            "unit": "bytes",
            "extra": "raw=158157; brotli=44987"
          },
          {
            "name": "solid-start.full",
            "value": 56583,
            "unit": "bytes",
            "extra": "raw=174369; brotli=49691"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "616481641456e42fb54e37b7c9e62a5f6876a9bd",
          "message": "feat: transformAssets (#7009)\n\n* feat: transformAssets\n\nreplaces transformAssetUrls\n\n* fix\n\n* fix",
          "timestamp": "2026-03-22T20:25:12+01:00",
          "tree_id": "0dcdfa31b6dd8589a396b6d2cc3ffcc0736512d2",
          "url": "https://github.com/TanStack/router/commit/616481641456e42fb54e37b7c9e62a5f6876a9bd"
        },
        "date": 1774207648897,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90269,
            "unit": "bytes",
            "extra": "raw=285043; brotli=78395"
          },
          {
            "name": "react-router.full",
            "value": 93576,
            "unit": "bytes",
            "extra": "raw=296298; brotli=81112"
          },
          {
            "name": "solid-router.minimal",
            "value": 36656,
            "unit": "bytes",
            "extra": "raw=110861; brotli=32847"
          },
          {
            "name": "solid-router.full",
            "value": 41181,
            "unit": "bytes",
            "extra": "raw=124581; brotli=36879"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 60051,
            "unit": "bytes",
            "extra": "raw=174048; brotli=53780"
          },
          {
            "name": "react-start.minimal",
            "value": 105017,
            "unit": "bytes",
            "extra": "raw=334216; brotli=90764"
          },
          {
            "name": "react-start.full",
            "value": 108494,
            "unit": "bytes",
            "extra": "raw=344774; brotli=93685"
          },
          {
            "name": "solid-start.minimal",
            "value": 51064,
            "unit": "bytes",
            "extra": "raw=158157; brotli=44987"
          },
          {
            "name": "solid-start.full",
            "value": 56682,
            "unit": "bytes",
            "extra": "raw=174638; brotli=49782"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "122984423+huseeiin@users.noreply.github.com",
            "name": "huseeiin",
            "username": "huseeiin"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6077120efa59125ab79a6aff7cdb54ddae986d25",
          "message": "fix: vite preview streaming (#6828)\n\n\n\n---------\n\nCo-authored-by: Birk Skyum <birk.skyum@pm.me>",
          "timestamp": "2026-03-23T14:05:00+01:00",
          "tree_id": "1a55581ba5ab02b450a24e93c3518d34a666d5a9",
          "url": "https://github.com/TanStack/router/commit/6077120efa59125ab79a6aff7cdb54ddae986d25"
        },
        "date": 1774271243402,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90269,
            "unit": "bytes",
            "extra": "raw=285043; brotli=78395"
          },
          {
            "name": "react-router.full",
            "value": 93576,
            "unit": "bytes",
            "extra": "raw=296298; brotli=81112"
          },
          {
            "name": "solid-router.minimal",
            "value": 36656,
            "unit": "bytes",
            "extra": "raw=110861; brotli=32847"
          },
          {
            "name": "solid-router.full",
            "value": 41181,
            "unit": "bytes",
            "extra": "raw=124581; brotli=36879"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 60051,
            "unit": "bytes",
            "extra": "raw=174048; brotli=53780"
          },
          {
            "name": "react-start.minimal",
            "value": 105017,
            "unit": "bytes",
            "extra": "raw=334216; brotli=90764"
          },
          {
            "name": "react-start.full",
            "value": 108494,
            "unit": "bytes",
            "extra": "raw=344774; brotli=93685"
          },
          {
            "name": "solid-start.minimal",
            "value": 51064,
            "unit": "bytes",
            "extra": "raw=158157; brotli=44987"
          },
          {
            "name": "solid-start.full",
            "value": 56682,
            "unit": "bytes",
            "extra": "raw=174638; brotli=49782"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b1c0f4602df7d3950df199e6471774f0520a359b",
          "message": "chore: upgrade tooling to typescript 6 (#7024)",
          "timestamp": "2026-03-23T22:59:52+01:00",
          "tree_id": "ba22ae6fab7833b030db151f3b9b9549f315d8c8",
          "url": "https://github.com/TanStack/router/commit/b1c0f4602df7d3950df199e6471774f0520a359b"
        },
        "date": 1774303325379,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90269,
            "unit": "bytes",
            "extra": "raw=285043; brotli=78395"
          },
          {
            "name": "react-router.full",
            "value": 93576,
            "unit": "bytes",
            "extra": "raw=296298; brotli=81112"
          },
          {
            "name": "solid-router.minimal",
            "value": 36656,
            "unit": "bytes",
            "extra": "raw=110861; brotli=32847"
          },
          {
            "name": "solid-router.full",
            "value": 41181,
            "unit": "bytes",
            "extra": "raw=124581; brotli=36879"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 60051,
            "unit": "bytes",
            "extra": "raw=174048; brotli=53780"
          },
          {
            "name": "react-start.minimal",
            "value": 105017,
            "unit": "bytes",
            "extra": "raw=334216; brotli=90764"
          },
          {
            "name": "react-start.full",
            "value": 108494,
            "unit": "bytes",
            "extra": "raw=344774; brotli=93685"
          },
          {
            "name": "solid-start.minimal",
            "value": 51064,
            "unit": "bytes",
            "extra": "raw=158157; brotli=44987"
          },
          {
            "name": "solid-start.full",
            "value": 56682,
            "unit": "bytes",
            "extra": "raw=174638; brotli=49782"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7640f6e3f5d946ca1fd32729050d12642cf38502",
          "message": "refactor(router): remove global file route helpers (#7026)",
          "timestamp": "2026-03-24T23:55:17+01:00",
          "tree_id": "b6de0e9f5237d2f8d8530bdfcbc6a6ebc7d8e750",
          "url": "https://github.com/TanStack/router/commit/7640f6e3f5d946ca1fd32729050d12642cf38502"
        },
        "date": 1774393053732,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90155,
            "unit": "bytes",
            "extra": "raw=284223; brotli=78268"
          },
          {
            "name": "react-router.full",
            "value": 93466,
            "unit": "bytes",
            "extra": "raw=295478; brotli=81111"
          },
          {
            "name": "solid-router.minimal",
            "value": 36531,
            "unit": "bytes",
            "extra": "raw=110159; brotli=32796"
          },
          {
            "name": "solid-router.full",
            "value": 41035,
            "unit": "bytes",
            "extra": "raw=123879; brotli=36742"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 60051,
            "unit": "bytes",
            "extra": "raw=174048; brotli=53780"
          },
          {
            "name": "react-start.minimal",
            "value": 104858,
            "unit": "bytes",
            "extra": "raw=333396; brotli=90573"
          },
          {
            "name": "react-start.full",
            "value": 108370,
            "unit": "bytes",
            "extra": "raw=343954; brotli=93650"
          },
          {
            "name": "solid-start.minimal",
            "value": 50936,
            "unit": "bytes",
            "extra": "raw=157455; brotli=44941"
          },
          {
            "name": "solid-start.full",
            "value": 56544,
            "unit": "bytes",
            "extra": "raw=173936; brotli=49698"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ed9c43df7ab8c679f6e6833d94651a0a091b9880",
          "message": "fix: dedupe repeated css assets in the start manifest (#7030)",
          "timestamp": "2026-03-25T00:00:49+01:00",
          "tree_id": "a66ec6a87d8a8b89c8d68a6e11f0ccef1cfae8d2",
          "url": "https://github.com/TanStack/router/commit/ed9c43df7ab8c679f6e6833d94651a0a091b9880"
        },
        "date": 1774393386936,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 90155,
            "unit": "bytes",
            "extra": "raw=284223; brotli=78268"
          },
          {
            "name": "react-router.full",
            "value": 93466,
            "unit": "bytes",
            "extra": "raw=295478; brotli=81111"
          },
          {
            "name": "solid-router.minimal",
            "value": 36531,
            "unit": "bytes",
            "extra": "raw=110159; brotli=32796"
          },
          {
            "name": "solid-router.full",
            "value": 41035,
            "unit": "bytes",
            "extra": "raw=123879; brotli=36742"
          },
          {
            "name": "vue-router.minimal",
            "value": 55067,
            "unit": "bytes",
            "extra": "raw=158200; brotli=49388"
          },
          {
            "name": "vue-router.full",
            "value": 60051,
            "unit": "bytes",
            "extra": "raw=174048; brotli=53780"
          },
          {
            "name": "react-start.minimal",
            "value": 104858,
            "unit": "bytes",
            "extra": "raw=333396; brotli=90573"
          },
          {
            "name": "react-start.full",
            "value": 108370,
            "unit": "bytes",
            "extra": "raw=343954; brotli=93650"
          },
          {
            "name": "solid-start.minimal",
            "value": 50936,
            "unit": "bytes",
            "extra": "raw=157455; brotli=44941"
          },
          {
            "name": "solid-start.full",
            "value": 56544,
            "unit": "bytes",
            "extra": "raw=173936; brotli=49698"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "71a8b684c87c37fd4a033d99f5ba4a05c7a179f5",
          "message": "chore: update TanStack Store to 0.9.3 (#7041)",
          "timestamp": "2026-03-25T19:21:58+01:00",
          "tree_id": "bcee91535e498032afb913098182b780b1445b2b",
          "url": "https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5"
        },
        "date": 1774463053938,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89781,
            "unit": "bytes",
            "extra": "raw=283080; brotli=78011"
          },
          {
            "name": "react-router.full",
            "value": 93089,
            "unit": "bytes",
            "extra": "raw=294335; brotli=80700"
          },
          {
            "name": "solid-router.minimal",
            "value": 36531,
            "unit": "bytes",
            "extra": "raw=110159; brotli=32796"
          },
          {
            "name": "solid-router.full",
            "value": 41035,
            "unit": "bytes",
            "extra": "raw=123879; brotli=36742"
          },
          {
            "name": "vue-router.minimal",
            "value": 54707,
            "unit": "bytes",
            "extra": "raw=157057; brotli=48974"
          },
          {
            "name": "vue-router.full",
            "value": 59714,
            "unit": "bytes",
            "extra": "raw=172905; brotli=53381"
          },
          {
            "name": "react-start.minimal",
            "value": 104541,
            "unit": "bytes",
            "extra": "raw=332253; brotli=90339"
          },
          {
            "name": "react-start.full",
            "value": 108007,
            "unit": "bytes",
            "extra": "raw=342811; brotli=93402"
          },
          {
            "name": "solid-start.minimal",
            "value": 50936,
            "unit": "bytes",
            "extra": "raw=157455; brotli=44941"
          },
          {
            "name": "solid-start.full",
            "value": 56544,
            "unit": "bytes",
            "extra": "raw=173936; brotli=49698"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "dgreif@users.noreply.github.com",
            "name": "Dusty Greif",
            "username": "dgreif"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5016e4e4c7387a1c0342e474e3e83bdf664e2f1d",
          "message": "fix: add tsconfig.server-entry.json to fix missing declaration files … (#7035)\n\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>\nCo-authored-by: dgreif <3026298+dgreif@users.noreply.github.com>\nCo-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>\nCo-authored-by: Manuel Schiller <manuel.schiller@caligano.de>",
          "timestamp": "2026-03-25T22:37:24+01:00",
          "tree_id": "10289e364beb7c5bba29c824c34d79048bfefabf",
          "url": "https://github.com/TanStack/router/commit/5016e4e4c7387a1c0342e474e3e83bdf664e2f1d"
        },
        "date": 1774474774242,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89781,
            "unit": "bytes",
            "extra": "raw=283080; brotli=78011"
          },
          {
            "name": "react-router.full",
            "value": 93089,
            "unit": "bytes",
            "extra": "raw=294335; brotli=80700"
          },
          {
            "name": "solid-router.minimal",
            "value": 36531,
            "unit": "bytes",
            "extra": "raw=110159; brotli=32796"
          },
          {
            "name": "solid-router.full",
            "value": 41035,
            "unit": "bytes",
            "extra": "raw=123879; brotli=36742"
          },
          {
            "name": "vue-router.minimal",
            "value": 54707,
            "unit": "bytes",
            "extra": "raw=157057; brotli=48974"
          },
          {
            "name": "vue-router.full",
            "value": 59714,
            "unit": "bytes",
            "extra": "raw=172905; brotli=53381"
          },
          {
            "name": "react-start.minimal",
            "value": 104541,
            "unit": "bytes",
            "extra": "raw=332253; brotli=90339"
          },
          {
            "name": "react-start.full",
            "value": 108007,
            "unit": "bytes",
            "extra": "raw=342811; brotli=93402"
          },
          {
            "name": "solid-start.minimal",
            "value": 50936,
            "unit": "bytes",
            "extra": "raw=157455; brotli=44941"
          },
          {
            "name": "solid-start.full",
            "value": 56544,
            "unit": "bytes",
            "extra": "raw=173936; brotli=49698"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cf5f5542476137a81515099ad740747e84512f9a",
          "message": "fix: scroll restorating without throttling (#7042)",
          "timestamp": "2026-03-26T18:00:55+01:00",
          "tree_id": "503ea96cdedbca09a26dd814eed959e24b8ea991",
          "url": "https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a"
        },
        "date": 1774544579271,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89631,
            "unit": "bytes",
            "extra": "raw=282521; brotli=77925"
          },
          {
            "name": "react-router.full",
            "value": 92997,
            "unit": "bytes",
            "extra": "raw=293975; brotli=80736"
          },
          {
            "name": "solid-router.minimal",
            "value": 36418,
            "unit": "bytes",
            "extra": "raw=109807; brotli=32661"
          },
          {
            "name": "solid-router.full",
            "value": 41004,
            "unit": "bytes",
            "extra": "raw=123669; brotli=36791"
          },
          {
            "name": "vue-router.minimal",
            "value": 54703,
            "unit": "bytes",
            "extra": "raw=156843; brotli=49033"
          },
          {
            "name": "vue-router.full",
            "value": 59681,
            "unit": "bytes",
            "extra": "raw=172675; brotli=53456"
          },
          {
            "name": "react-start.minimal",
            "value": 104476,
            "unit": "bytes",
            "extra": "raw=331854; brotli=90389"
          },
          {
            "name": "react-start.full",
            "value": 107938,
            "unit": "bytes",
            "extra": "raw=342451; brotli=93258"
          },
          {
            "name": "solid-start.minimal",
            "value": 50846,
            "unit": "bytes",
            "extra": "raw=157103; brotli=44815"
          },
          {
            "name": "solid-start.full",
            "value": 56488,
            "unit": "bytes",
            "extra": "raw=173730; brotli=49730"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "github@stdd.dev",
            "name": "육기준",
            "username": "six-standard"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a1ab2646348cb9fa89c98b2128a65d992925014f",
          "message": "fix: unexported `ShouldBlockFnLocation` interface causes TS4023 (#7037)\n\nCo-authored-by: yook-gijun <gijun@dreamend.com>",
          "timestamp": "2026-03-26T18:06:49+01:00",
          "tree_id": "0559c8143218ecb9a52429a9b189445dab62ed22",
          "url": "https://github.com/TanStack/router/commit/a1ab2646348cb9fa89c98b2128a65d992925014f"
        },
        "date": 1774544935555,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89631,
            "unit": "bytes",
            "extra": "raw=282521; brotli=77925"
          },
          {
            "name": "react-router.full",
            "value": 92997,
            "unit": "bytes",
            "extra": "raw=293975; brotli=80736"
          },
          {
            "name": "solid-router.minimal",
            "value": 36418,
            "unit": "bytes",
            "extra": "raw=109807; brotli=32661"
          },
          {
            "name": "solid-router.full",
            "value": 41004,
            "unit": "bytes",
            "extra": "raw=123669; brotli=36791"
          },
          {
            "name": "vue-router.minimal",
            "value": 54703,
            "unit": "bytes",
            "extra": "raw=156843; brotli=49033"
          },
          {
            "name": "vue-router.full",
            "value": 59681,
            "unit": "bytes",
            "extra": "raw=172675; brotli=53456"
          },
          {
            "name": "react-start.minimal",
            "value": 104476,
            "unit": "bytes",
            "extra": "raw=331854; brotli=90389"
          },
          {
            "name": "react-start.full",
            "value": 107938,
            "unit": "bytes",
            "extra": "raw=342451; brotli=93258"
          },
          {
            "name": "solid-start.minimal",
            "value": 50846,
            "unit": "bytes",
            "extra": "raw=157103; brotli=44815"
          },
          {
            "name": "solid-start.full",
            "value": 56488,
            "unit": "bytes",
            "extra": "raw=173730; brotli=49730"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "70b222513720d99c6d44bd3f28d1e9b19dc91a43",
          "message": "fix: Fix file-based route generation when custom `routeToken` or `ind… (#7048)\n\nfix: Fix file-based route generation when custom `routeToken` or `indexToken` values start with regex metacharacters like `+`.\n\nfixes #7036",
          "timestamp": "2026-03-26T20:36:30+01:00",
          "tree_id": "a0ecac8365a360a629c4cc45e2d7cfca2c0d127f",
          "url": "https://github.com/TanStack/router/commit/70b222513720d99c6d44bd3f28d1e9b19dc91a43"
        },
        "date": 1774553924058,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89631,
            "unit": "bytes",
            "extra": "raw=282521; brotli=77925"
          },
          {
            "name": "react-router.full",
            "value": 92997,
            "unit": "bytes",
            "extra": "raw=293975; brotli=80736"
          },
          {
            "name": "solid-router.minimal",
            "value": 36418,
            "unit": "bytes",
            "extra": "raw=109807; brotli=32661"
          },
          {
            "name": "solid-router.full",
            "value": 41004,
            "unit": "bytes",
            "extra": "raw=123669; brotli=36791"
          },
          {
            "name": "vue-router.minimal",
            "value": 54703,
            "unit": "bytes",
            "extra": "raw=156843; brotli=49033"
          },
          {
            "name": "vue-router.full",
            "value": 59681,
            "unit": "bytes",
            "extra": "raw=172675; brotli=53456"
          },
          {
            "name": "react-start.minimal",
            "value": 104476,
            "unit": "bytes",
            "extra": "raw=331854; brotli=90389"
          },
          {
            "name": "react-start.full",
            "value": 107938,
            "unit": "bytes",
            "extra": "raw=342451; brotli=93258"
          },
          {
            "name": "solid-start.minimal",
            "value": 50846,
            "unit": "bytes",
            "extra": "raw=157103; brotli=44815"
          },
          {
            "name": "solid-start.full",
            "value": 56488,
            "unit": "bytes",
            "extra": "raw=173730; brotli=49730"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5ca661c2f8a7e50167b4112c64aa06cef4148ea9",
          "message": "fix: dont use script tag for OnRendered (#7054)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-03-27T00:54:57+01:00",
          "tree_id": "1e3b96811bb60a7812c94505fc85c7603b74f470",
          "url": "https://github.com/TanStack/router/commit/5ca661c2f8a7e50167b4112c64aa06cef4148ea9"
        },
        "date": 1774569432952,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89631,
            "unit": "bytes",
            "extra": "raw=282492; brotli=77884"
          },
          {
            "name": "react-router.full",
            "value": 93016,
            "unit": "bytes",
            "extra": "raw=293947; brotli=80861"
          },
          {
            "name": "solid-router.minimal",
            "value": 36418,
            "unit": "bytes",
            "extra": "raw=109807; brotli=32661"
          },
          {
            "name": "solid-router.full",
            "value": 41004,
            "unit": "bytes",
            "extra": "raw=123669; brotli=36791"
          },
          {
            "name": "vue-router.minimal",
            "value": 54703,
            "unit": "bytes",
            "extra": "raw=156843; brotli=49033"
          },
          {
            "name": "vue-router.full",
            "value": 59681,
            "unit": "bytes",
            "extra": "raw=172675; brotli=53456"
          },
          {
            "name": "react-start.minimal",
            "value": 104500,
            "unit": "bytes",
            "extra": "raw=331826; brotli=90417"
          },
          {
            "name": "react-start.full",
            "value": 107956,
            "unit": "bytes",
            "extra": "raw=342423; brotli=93319"
          },
          {
            "name": "solid-start.minimal",
            "value": 50846,
            "unit": "bytes",
            "extra": "raw=157103; brotli=44815"
          },
          {
            "name": "solid-start.full",
            "value": 56488,
            "unit": "bytes",
            "extra": "raw=173730; brotli=49730"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "42c3f3b3a3a478fd6d6894310ef94b2d23794b8e",
          "message": "fix: scroll restoration upon browser forward navigation (#7055)",
          "timestamp": "2026-03-27T01:24:06+01:00",
          "tree_id": "6f86dc1f53408e38a67cf4d5b6b191fcd2d35d08",
          "url": "https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e"
        },
        "date": 1774571185880,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89566,
            "unit": "bytes",
            "extra": "raw=282290; brotli=77812"
          },
          {
            "name": "react-router.full",
            "value": 92938,
            "unit": "bytes",
            "extra": "raw=293745; brotli=80851"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109605; brotli=32662"
          },
          {
            "name": "solid-router.full",
            "value": 40944,
            "unit": "bytes",
            "extra": "raw=123467; brotli=36700"
          },
          {
            "name": "vue-router.minimal",
            "value": 54642,
            "unit": "bytes",
            "extra": "raw=156641; brotli=49062"
          },
          {
            "name": "vue-router.full",
            "value": 59620,
            "unit": "bytes",
            "extra": "raw=172473; brotli=53325"
          },
          {
            "name": "react-start.minimal",
            "value": 104433,
            "unit": "bytes",
            "extra": "raw=331624; brotli=90358"
          },
          {
            "name": "react-start.full",
            "value": 107886,
            "unit": "bytes",
            "extra": "raw=342221; brotli=93288"
          },
          {
            "name": "solid-start.minimal",
            "value": 50795,
            "unit": "bytes",
            "extra": "raw=156901; brotli=44718"
          },
          {
            "name": "solid-start.full",
            "value": 56418,
            "unit": "bytes",
            "extra": "raw=173528; brotli=49594"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6ee0e795b085651beb2f1ac6503cdbd7eaffedd1",
          "message": "fix: preserve scroll position after SSR hash hydration (#7066)",
          "timestamp": "2026-03-28T19:38:33+01:00",
          "tree_id": "8f300ea732f8ccb1ae57ff7c2a981ad6e7a8c6e4",
          "url": "https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1"
        },
        "date": 1774723240358,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89566,
            "unit": "bytes",
            "extra": "raw=282290; brotli=77812"
          },
          {
            "name": "react-router.full",
            "value": 92938,
            "unit": "bytes",
            "extra": "raw=293745; brotli=80851"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109605; brotli=32662"
          },
          {
            "name": "solid-router.full",
            "value": 40944,
            "unit": "bytes",
            "extra": "raw=123467; brotli=36700"
          },
          {
            "name": "vue-router.minimal",
            "value": 54642,
            "unit": "bytes",
            "extra": "raw=156641; brotli=49062"
          },
          {
            "name": "vue-router.full",
            "value": 59620,
            "unit": "bytes",
            "extra": "raw=172473; brotli=53325"
          },
          {
            "name": "react-start.minimal",
            "value": 104440,
            "unit": "bytes",
            "extra": "raw=331688; brotli=90307"
          },
          {
            "name": "react-start.full",
            "value": 107890,
            "unit": "bytes",
            "extra": "raw=342285; brotli=93187"
          },
          {
            "name": "solid-start.minimal",
            "value": 50799,
            "unit": "bytes",
            "extra": "raw=156965; brotli=44738"
          },
          {
            "name": "solid-start.full",
            "value": 56425,
            "unit": "bytes",
            "extra": "raw=173592; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nic.beaussart@gmail.com",
            "name": "Nicolas Beaussart",
            "username": "beaussan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7b9faaeee045b018240cb29304c4cae207ce4e57",
          "message": "test: cover lazy errorComponent behavior across frameworks (#7068)",
          "timestamp": "2026-03-29T18:08:38+02:00",
          "tree_id": "4063256ed879a55af410ba605f0348103863e2ef",
          "url": "https://github.com/TanStack/router/commit/7b9faaeee045b018240cb29304c4cae207ce4e57"
        },
        "date": 1774800648817,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89566,
            "unit": "bytes",
            "extra": "raw=282290; brotli=77812"
          },
          {
            "name": "react-router.full",
            "value": 92938,
            "unit": "bytes",
            "extra": "raw=293745; brotli=80851"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109605; brotli=32662"
          },
          {
            "name": "solid-router.full",
            "value": 40944,
            "unit": "bytes",
            "extra": "raw=123467; brotli=36700"
          },
          {
            "name": "vue-router.minimal",
            "value": 54642,
            "unit": "bytes",
            "extra": "raw=156641; brotli=49062"
          },
          {
            "name": "vue-router.full",
            "value": 59620,
            "unit": "bytes",
            "extra": "raw=172473; brotli=53325"
          },
          {
            "name": "react-start.minimal",
            "value": 104440,
            "unit": "bytes",
            "extra": "raw=331688; brotli=90307"
          },
          {
            "name": "react-start.full",
            "value": 107890,
            "unit": "bytes",
            "extra": "raw=342285; brotli=93187"
          },
          {
            "name": "solid-start.minimal",
            "value": 50799,
            "unit": "bytes",
            "extra": "raw=156965; brotli=44738"
          },
          {
            "name": "solid-start.full",
            "value": 56425,
            "unit": "bytes",
            "extra": "raw=173592; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "44094871+nlynzaad@users.noreply.github.com",
            "name": "Nico Lynzaad",
            "username": "nlynzaad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "30835cb8e935b740c92fa95909a073e644dde530",
          "message": "fix(router-core): align calculation of publicHref in parseLocation and buildLocation (#7069)\n\n* align publicHref\n\n* add tests\n\n* ci: apply automated fixes\n\n* revert changes\n\n* revert changes\n\n* ci: apply automated fixes [Self-Healing CI Rerun]\n\n* ci: apply automated fixes\n\n---------\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-03-30T00:57:24+02:00",
          "tree_id": "6d55e570f544bd5ec712e4fb503c3bd5a7f3dd4c",
          "url": "https://github.com/TanStack/router/commit/30835cb8e935b740c92fa95909a073e644dde530"
        },
        "date": 1774825173270,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89569,
            "unit": "bytes",
            "extra": "raw=282294; brotli=77757"
          },
          {
            "name": "react-router.full",
            "value": 92941,
            "unit": "bytes",
            "extra": "raw=293749; brotli=80759"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109609; brotli=32636"
          },
          {
            "name": "solid-router.full",
            "value": 40945,
            "unit": "bytes",
            "extra": "raw=123471; brotli=36750"
          },
          {
            "name": "vue-router.minimal",
            "value": 54644,
            "unit": "bytes",
            "extra": "raw=156645; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59622,
            "unit": "bytes",
            "extra": "raw=172477; brotli=53333"
          },
          {
            "name": "react-start.minimal",
            "value": 104443,
            "unit": "bytes",
            "extra": "raw=331692; brotli=90285"
          },
          {
            "name": "react-start.full",
            "value": 107893,
            "unit": "bytes",
            "extra": "raw=342289; brotli=93194"
          },
          {
            "name": "solid-start.minimal",
            "value": 50802,
            "unit": "bytes",
            "extra": "raw=156969; brotli=44804"
          },
          {
            "name": "solid-start.full",
            "value": 56425,
            "unit": "bytes",
            "extra": "raw=173596; brotli=49620"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f8351a8d7aa9f5a341377f96966451892acb39f1",
          "message": "fix: initialize import.meta.hot.data before storing stable split componts (#7074)\n\n* fix: initialize import.meta.hot.data before storing stable split components\n\nfixes #7073\n\n* fix: initialize import.meta.hot.data before storing stable split components\n\nfixes #7073 [Self-Healing CI Rerun]\n\n---------\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-03-30T18:08:52+02:00",
          "tree_id": "b6c6ce69df233d8c836097396a892f089ca7d731",
          "url": "https://github.com/TanStack/router/commit/f8351a8d7aa9f5a341377f96966451892acb39f1"
        },
        "date": 1774887073002,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89569,
            "unit": "bytes",
            "extra": "raw=282294; brotli=77757"
          },
          {
            "name": "react-router.full",
            "value": 92941,
            "unit": "bytes",
            "extra": "raw=293749; brotli=80759"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109609; brotli=32636"
          },
          {
            "name": "solid-router.full",
            "value": 40945,
            "unit": "bytes",
            "extra": "raw=123471; brotli=36750"
          },
          {
            "name": "vue-router.minimal",
            "value": 54644,
            "unit": "bytes",
            "extra": "raw=156645; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59622,
            "unit": "bytes",
            "extra": "raw=172477; brotli=53333"
          },
          {
            "name": "react-start.minimal",
            "value": 104443,
            "unit": "bytes",
            "extra": "raw=331692; brotli=90285"
          },
          {
            "name": "react-start.full",
            "value": 107893,
            "unit": "bytes",
            "extra": "raw=342289; brotli=93194"
          },
          {
            "name": "solid-start.minimal",
            "value": 50802,
            "unit": "bytes",
            "extra": "raw=156969; brotli=44804"
          },
          {
            "name": "solid-start.full",
            "value": 56425,
            "unit": "bytes",
            "extra": "raw=173596; brotli=49620"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2d1ec865a446926f7db6e29dbbde82d265de6d36",
          "message": "fix(router-core): stop preload after beforeLoad errors (#7075)",
          "timestamp": "2026-03-30T23:47:59+02:00",
          "tree_id": "c966ace889ccd4e8d2263f53802e92768c0462d7",
          "url": "https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36"
        },
        "date": 1774907410117,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89577,
            "unit": "bytes",
            "extra": "raw=282335; brotli=77826"
          },
          {
            "name": "react-router.full",
            "value": 92947,
            "unit": "bytes",
            "extra": "raw=293790; brotli=80690"
          },
          {
            "name": "solid-router.minimal",
            "value": 36368,
            "unit": "bytes",
            "extra": "raw=109650; brotli=32639"
          },
          {
            "name": "solid-router.full",
            "value": 40950,
            "unit": "bytes",
            "extra": "raw=123512; brotli=36731"
          },
          {
            "name": "vue-router.minimal",
            "value": 54651,
            "unit": "bytes",
            "extra": "raw=156686; brotli=49053"
          },
          {
            "name": "vue-router.full",
            "value": 59628,
            "unit": "bytes",
            "extra": "raw=172518; brotli=53416"
          },
          {
            "name": "react-start.minimal",
            "value": 104448,
            "unit": "bytes",
            "extra": "raw=331733; brotli=90311"
          },
          {
            "name": "react-start.full",
            "value": 107901,
            "unit": "bytes",
            "extra": "raw=342330; brotli=93284"
          },
          {
            "name": "solid-start.minimal",
            "value": 50808,
            "unit": "bytes",
            "extra": "raw=157010; brotli=44817"
          },
          {
            "name": "solid-start.full",
            "value": 56436,
            "unit": "bytes",
            "extra": "raw=173637; brotli=49623"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "796406da66cfb12b518bb3ca326c9d541368fb06",
          "message": "fix: preserve render-thrown notFound errors (#7077)",
          "timestamp": "2026-03-31T01:09:27+02:00",
          "tree_id": "ed924b707af492d78e21fcf518205ed7e9cd6147",
          "url": "https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06"
        },
        "date": 1774912303715,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89584,
            "unit": "bytes",
            "extra": "raw=282379; brotli=77792"
          },
          {
            "name": "react-router.full",
            "value": 92954,
            "unit": "bytes",
            "extra": "raw=293834; brotli=80847"
          },
          {
            "name": "solid-router.minimal",
            "value": 36414,
            "unit": "bytes",
            "extra": "raw=109832; brotli=32704"
          },
          {
            "name": "solid-router.full",
            "value": 40989,
            "unit": "bytes",
            "extra": "raw=123694; brotli=36801"
          },
          {
            "name": "vue-router.minimal",
            "value": 54665,
            "unit": "bytes",
            "extra": "raw=156744; brotli=49086"
          },
          {
            "name": "vue-router.full",
            "value": 59645,
            "unit": "bytes",
            "extra": "raw=172576; brotli=53433"
          },
          {
            "name": "react-start.minimal",
            "value": 104456,
            "unit": "bytes",
            "extra": "raw=331777; brotli=90330"
          },
          {
            "name": "react-start.full",
            "value": 107910,
            "unit": "bytes",
            "extra": "raw=342374; brotli=93323"
          },
          {
            "name": "solid-start.minimal",
            "value": 50856,
            "unit": "bytes",
            "extra": "raw=157192; brotli=44897"
          },
          {
            "name": "solid-start.full",
            "value": 56496,
            "unit": "bytes",
            "extra": "raw=173818; brotli=49627"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tannerlinsley@gmail.com",
            "name": "Tanner Linsley",
            "username": "tannerlinsley"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f7e9c5e323793d1b28c96871819c265fd28ae397",
          "message": "fix: preserve request context precedence for server functions (#7135)",
          "timestamp": "2026-04-10T19:51:47+02:00",
          "tree_id": "c85cd4e7b06581e91d2037b8010fd55b740773c1",
          "url": "https://github.com/TanStack/router/commit/f7e9c5e323793d1b28c96871819c265fd28ae397"
        },
        "date": 1775843646241,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89584,
            "unit": "bytes",
            "extra": "raw=282379; brotli=77792"
          },
          {
            "name": "react-router.full",
            "value": 92954,
            "unit": "bytes",
            "extra": "raw=293834; brotli=80847"
          },
          {
            "name": "solid-router.minimal",
            "value": 36414,
            "unit": "bytes",
            "extra": "raw=109832; brotli=32704"
          },
          {
            "name": "solid-router.full",
            "value": 40989,
            "unit": "bytes",
            "extra": "raw=123694; brotli=36801"
          },
          {
            "name": "vue-router.minimal",
            "value": 54665,
            "unit": "bytes",
            "extra": "raw=156744; brotli=49086"
          },
          {
            "name": "vue-router.full",
            "value": 59645,
            "unit": "bytes",
            "extra": "raw=172576; brotli=53433"
          },
          {
            "name": "react-start.minimal",
            "value": 104456,
            "unit": "bytes",
            "extra": "raw=331777; brotli=90330"
          },
          {
            "name": "react-start.full",
            "value": 107911,
            "unit": "bytes",
            "extra": "raw=342374; brotli=93177"
          },
          {
            "name": "solid-start.minimal",
            "value": 50856,
            "unit": "bytes",
            "extra": "raw=157192; brotli=44897"
          },
          {
            "name": "solid-start.full",
            "value": 56498,
            "unit": "bytes",
            "extra": "raw=173818; brotli=49717"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4b9ed6c5cb5437df8607c605728c8338dd2eb02c",
          "message": "fix: don't leak internal props in Link (#7138)",
          "timestamp": "2026-04-10T20:18:20+02:00",
          "tree_id": "6f3900684084637383930183eab202b563993516",
          "url": "https://github.com/TanStack/router/commit/4b9ed6c5cb5437df8607c605728c8338dd2eb02c"
        },
        "date": 1775845638113,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89600,
            "unit": "bytes",
            "extra": "raw=282415; brotli=77832"
          },
          {
            "name": "react-router.full",
            "value": 92952,
            "unit": "bytes",
            "extra": "raw=293872; brotli=80836"
          },
          {
            "name": "solid-router.minimal",
            "value": 36429,
            "unit": "bytes",
            "extra": "raw=109864; brotli=32735"
          },
          {
            "name": "solid-router.full",
            "value": 41003,
            "unit": "bytes",
            "extra": "raw=123726; brotli=36718"
          },
          {
            "name": "vue-router.minimal",
            "value": 54716,
            "unit": "bytes",
            "extra": "raw=156771; brotli=49169"
          },
          {
            "name": "vue-router.full",
            "value": 59720,
            "unit": "bytes",
            "extra": "raw=172604; brotli=53440"
          },
          {
            "name": "react-start.minimal",
            "value": 104440,
            "unit": "bytes",
            "extra": "raw=331815; brotli=90336"
          },
          {
            "name": "react-start.full",
            "value": 107922,
            "unit": "bytes",
            "extra": "raw=342412; brotli=93214"
          },
          {
            "name": "solid-start.minimal",
            "value": 50872,
            "unit": "bytes",
            "extra": "raw=157224; brotli=44791"
          },
          {
            "name": "solid-start.full",
            "value": 56510,
            "unit": "bytes",
            "extra": "raw=173850; brotli=49735"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b29d64de0c400183114c12f82183f80e37d9ea5c",
          "message": "fix(router): handle redirected lazy pending matches (#7137)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-10T21:17:37+02:00",
          "tree_id": "a810f5c9f5b87fe0d8f45b5e6ed42ab0444bb8de",
          "url": "https://github.com/TanStack/router/commit/b29d64de0c400183114c12f82183f80e37d9ea5c"
        },
        "date": 1775848795300,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89621,
            "unit": "bytes",
            "extra": "raw=282381; brotli=77763"
          },
          {
            "name": "react-router.full",
            "value": 92959,
            "unit": "bytes",
            "extra": "raw=293838; brotli=80785"
          },
          {
            "name": "solid-router.minimal",
            "value": 36457,
            "unit": "bytes",
            "extra": "raw=109935; brotli=32711"
          },
          {
            "name": "solid-router.full",
            "value": 41034,
            "unit": "bytes",
            "extra": "raw=123797; brotli=36823"
          },
          {
            "name": "vue-router.minimal",
            "value": 54747,
            "unit": "bytes",
            "extra": "raw=156837; brotli=49154"
          },
          {
            "name": "vue-router.full",
            "value": 59756,
            "unit": "bytes",
            "extra": "raw=172670; brotli=53503"
          },
          {
            "name": "react-start.minimal",
            "value": 104467,
            "unit": "bytes",
            "extra": "raw=331781; brotli=90320"
          },
          {
            "name": "react-start.full",
            "value": 107942,
            "unit": "bytes",
            "extra": "raw=342378; brotli=93268"
          },
          {
            "name": "solid-start.minimal",
            "value": 50897,
            "unit": "bytes",
            "extra": "raw=157295; brotli=44820"
          },
          {
            "name": "solid-start.full",
            "value": 56540,
            "unit": "bytes",
            "extra": "raw=173921; brotli=49751"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "540d22100d33415a1ddc9eb193f6aeb8184da77f",
          "message": "fix: MatchRoute types (#7139)\n\nCo-authored-by: schiller-manuel <schiller-manuel@users.noreply.github.com>\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-10T21:35:42+02:00",
          "tree_id": "602478a895dfe85a7eb34bb119136d386bd7b69c",
          "url": "https://github.com/TanStack/router/commit/540d22100d33415a1ddc9eb193f6aeb8184da77f"
        },
        "date": 1775849871684,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89621,
            "unit": "bytes",
            "extra": "raw=282381; brotli=77763"
          },
          {
            "name": "react-router.full",
            "value": 92959,
            "unit": "bytes",
            "extra": "raw=293838; brotli=80785"
          },
          {
            "name": "solid-router.minimal",
            "value": 36457,
            "unit": "bytes",
            "extra": "raw=109935; brotli=32711"
          },
          {
            "name": "solid-router.full",
            "value": 41034,
            "unit": "bytes",
            "extra": "raw=123797; brotli=36823"
          },
          {
            "name": "vue-router.minimal",
            "value": 54747,
            "unit": "bytes",
            "extra": "raw=156837; brotli=49154"
          },
          {
            "name": "vue-router.full",
            "value": 59756,
            "unit": "bytes",
            "extra": "raw=172670; brotli=53503"
          },
          {
            "name": "react-start.minimal",
            "value": 104467,
            "unit": "bytes",
            "extra": "raw=331781; brotli=90320"
          },
          {
            "name": "react-start.full",
            "value": 107942,
            "unit": "bytes",
            "extra": "raw=342378; brotli=93268"
          },
          {
            "name": "solid-start.minimal",
            "value": 50897,
            "unit": "bytes",
            "extra": "raw=157295; brotli=44820"
          },
          {
            "name": "solid-start.full",
            "value": 56540,
            "unit": "bytes",
            "extra": "raw=173921; brotli=49751"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "70ec1da1ed8aa252fae67716f69fe8520ecf91b0",
          "message": "fix(react-router): clear stale route errors on navigation (#7136)\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>",
          "timestamp": "2026-04-10T22:37:04+02:00",
          "tree_id": "902e4fdd6db7c21ecf4da4a3177a47657c266da7",
          "url": "https://github.com/TanStack/router/commit/70ec1da1ed8aa252fae67716f69fe8520ecf91b0"
        },
        "date": 1775853552209,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89606,
            "unit": "bytes",
            "extra": "raw=282310; brotli=77902"
          },
          {
            "name": "react-router.full",
            "value": 92947,
            "unit": "bytes",
            "extra": "raw=293767; brotli=80843"
          },
          {
            "name": "solid-router.minimal",
            "value": 36457,
            "unit": "bytes",
            "extra": "raw=109935; brotli=32711"
          },
          {
            "name": "solid-router.full",
            "value": 41034,
            "unit": "bytes",
            "extra": "raw=123797; brotli=36823"
          },
          {
            "name": "vue-router.minimal",
            "value": 54747,
            "unit": "bytes",
            "extra": "raw=156837; brotli=49154"
          },
          {
            "name": "vue-router.full",
            "value": 59756,
            "unit": "bytes",
            "extra": "raw=172670; brotli=53503"
          },
          {
            "name": "react-start.minimal",
            "value": 104449,
            "unit": "bytes",
            "extra": "raw=331710; brotli=90275"
          },
          {
            "name": "react-start.full",
            "value": 107930,
            "unit": "bytes",
            "extra": "raw=342307; brotli=93217"
          },
          {
            "name": "solid-start.minimal",
            "value": 50897,
            "unit": "bytes",
            "extra": "raw=157295; brotli=44820"
          },
          {
            "name": "solid-start.full",
            "value": 56540,
            "unit": "bytes",
            "extra": "raw=173921; brotli=49751"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f920527e8d5a2124f0c8a1b2c9889c9d1bf29d90",
          "message": "efp (#7144)\n\nCo-authored-by: Tanner Linsley <tannerlinsley@gmail.com>",
          "timestamp": "2026-04-11T01:43:05+02:00",
          "tree_id": "939823281c45e7ce31b0458684cb61a4230edff5",
          "url": "https://github.com/TanStack/router/commit/f920527e8d5a2124f0c8a1b2c9889c9d1bf29d90"
        },
        "date": 1775864726662,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89606,
            "unit": "bytes",
            "extra": "raw=282310; brotli=77902"
          },
          {
            "name": "react-router.full",
            "value": 92947,
            "unit": "bytes",
            "extra": "raw=293767; brotli=80843"
          },
          {
            "name": "solid-router.minimal",
            "value": 36457,
            "unit": "bytes",
            "extra": "raw=109935; brotli=32711"
          },
          {
            "name": "solid-router.full",
            "value": 41034,
            "unit": "bytes",
            "extra": "raw=123797; brotli=36823"
          },
          {
            "name": "vue-router.minimal",
            "value": 54747,
            "unit": "bytes",
            "extra": "raw=156837; brotli=49154"
          },
          {
            "name": "vue-router.full",
            "value": 59756,
            "unit": "bytes",
            "extra": "raw=172670; brotli=53503"
          },
          {
            "name": "react-start.minimal",
            "value": 104346,
            "unit": "bytes",
            "extra": "raw=331338; brotli=90286"
          },
          {
            "name": "react-start.full",
            "value": 107878,
            "unit": "bytes",
            "extra": "raw=341937; brotli=93171"
          },
          {
            "name": "solid-start.minimal",
            "value": 50812,
            "unit": "bytes",
            "extra": "raw=156917; brotli=44815"
          },
          {
            "name": "solid-start.full",
            "value": 56475,
            "unit": "bytes",
            "extra": "raw=173543; brotli=49622"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tannerlinsley@gmail.com",
            "name": "Tanner Linsley",
            "username": "tannerlinsley"
          },
          "committer": {
            "email": "tannerlinsley@gmail.com",
            "name": "Tanner Linsley",
            "username": "tannerlinsley"
          },
          "distinct": true,
          "id": "e61c49ce31affa1837df922b7150a925ded0049d",
          "message": "chore: sync published start package versions",
          "timestamp": "2026-04-10T19:20:20-06:00",
          "tree_id": "be59600dfaf230efe98bdb1c383231aa8cf2be66",
          "url": "https://github.com/TanStack/router/commit/e61c49ce31affa1837df922b7150a925ded0049d"
        },
        "date": 1775870553928,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89606,
            "unit": "bytes",
            "extra": "raw=282310; brotli=77902"
          },
          {
            "name": "react-router.full",
            "value": 92947,
            "unit": "bytes",
            "extra": "raw=293767; brotli=80843"
          },
          {
            "name": "solid-router.minimal",
            "value": 36457,
            "unit": "bytes",
            "extra": "raw=109935; brotli=32711"
          },
          {
            "name": "solid-router.full",
            "value": 41034,
            "unit": "bytes",
            "extra": "raw=123797; brotli=36823"
          },
          {
            "name": "vue-router.minimal",
            "value": 54747,
            "unit": "bytes",
            "extra": "raw=156837; brotli=49154"
          },
          {
            "name": "vue-router.full",
            "value": 59756,
            "unit": "bytes",
            "extra": "raw=172670; brotli=53503"
          },
          {
            "name": "react-start.minimal",
            "value": 104346,
            "unit": "bytes",
            "extra": "raw=331338; brotli=90286"
          },
          {
            "name": "react-start.full",
            "value": 107878,
            "unit": "bytes",
            "extra": "raw=341937; brotli=93171"
          },
          {
            "name": "solid-start.minimal",
            "value": 50812,
            "unit": "bytes",
            "extra": "raw=156917; brotli=44815"
          },
          {
            "name": "solid-start.full",
            "value": 56475,
            "unit": "bytes",
            "extra": "raw=173543; brotli=49622"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "459057cd2d90cff20d20e51d4964b0a8c950555e",
          "message": "refactor: switch router stores to atom get/set API (#7150)",
          "timestamp": "2026-04-11T12:41:57+02:00",
          "tree_id": "69354bd32ffc1c9c8f4664a0b7cd23274d5088ae",
          "url": "https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e"
        },
        "date": 1775904250230,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89504,
            "unit": "bytes",
            "extra": "raw=281767; brotli=77747"
          },
          {
            "name": "react-router.full",
            "value": 92863,
            "unit": "bytes",
            "extra": "raw=293224; brotli=80679"
          },
          {
            "name": "solid-router.minimal",
            "value": 36424,
            "unit": "bytes",
            "extra": "raw=109736; brotli=32766"
          },
          {
            "name": "solid-router.full",
            "value": 41003,
            "unit": "bytes",
            "extra": "raw=123598; brotli=36814"
          },
          {
            "name": "vue-router.minimal",
            "value": 54647,
            "unit": "bytes",
            "extra": "raw=156255; brotli=49157"
          },
          {
            "name": "vue-router.full",
            "value": 59663,
            "unit": "bytes",
            "extra": "raw=172088; brotli=53423"
          },
          {
            "name": "react-start.minimal",
            "value": 104257,
            "unit": "bytes",
            "extra": "raw=330755; brotli=90130"
          },
          {
            "name": "react-start.full",
            "value": 107780,
            "unit": "bytes",
            "extra": "raw=341354; brotli=93270"
          },
          {
            "name": "solid-start.minimal",
            "value": 50783,
            "unit": "bytes",
            "extra": "raw=156678; brotli=44746"
          },
          {
            "name": "solid-start.full",
            "value": 56434,
            "unit": "bytes",
            "extra": "raw=173304; brotli=49652"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6355bb75f7637ba77f06a923c18fdaf37720bb48",
          "message": "refactor: shorten internal router store names (#7152)",
          "timestamp": "2026-04-11T13:21:43+02:00",
          "tree_id": "9ea348dcf266c6bd6a4a078937762c499eaf9e63",
          "url": "https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48"
        },
        "date": 1775906640156,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89437,
            "unit": "bytes",
            "extra": "raw=281225; brotli=77740"
          },
          {
            "name": "react-router.full",
            "value": 92790,
            "unit": "bytes",
            "extra": "raw=292564; brotli=80637"
          },
          {
            "name": "solid-router.minimal",
            "value": 36386,
            "unit": "bytes",
            "extra": "raw=109195; brotli=32746"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123009; brotli=36723"
          },
          {
            "name": "vue-router.minimal",
            "value": 54592,
            "unit": "bytes",
            "extra": "raw=155690; brotli=49034"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171481; brotli=53320"
          },
          {
            "name": "react-start.minimal",
            "value": 104189,
            "unit": "bytes",
            "extra": "raw=330095; brotli=90079"
          },
          {
            "name": "react-start.full",
            "value": 107716,
            "unit": "bytes",
            "extra": "raw=340674; brotli=93224"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156103; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56363,
            "unit": "bytes",
            "extra": "raw=172695; brotli=49561"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "james@reetgood.co.uk",
            "name": "James Howard",
            "username": "jameshoward"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b0597664e377969a5007513b8b6b03c2c92d9b9d",
          "message": "chore(types): re-export SearchMiddleware type from react-router (#7087)",
          "timestamp": "2026-04-11T16:07:09+02:00",
          "tree_id": "73925bb73809e2a64da3bdac5aebe3406edaa4df",
          "url": "https://github.com/TanStack/router/commit/b0597664e377969a5007513b8b6b03c2c92d9b9d"
        },
        "date": 1775916567374,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89437,
            "unit": "bytes",
            "extra": "raw=281225; brotli=77740"
          },
          {
            "name": "react-router.full",
            "value": 92790,
            "unit": "bytes",
            "extra": "raw=292564; brotli=80637"
          },
          {
            "name": "solid-router.minimal",
            "value": 36386,
            "unit": "bytes",
            "extra": "raw=109195; brotli=32746"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123009; brotli=36723"
          },
          {
            "name": "vue-router.minimal",
            "value": 54592,
            "unit": "bytes",
            "extra": "raw=155690; brotli=49034"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171481; brotli=53320"
          },
          {
            "name": "react-start.minimal",
            "value": 104189,
            "unit": "bytes",
            "extra": "raw=330095; brotli=90079"
          },
          {
            "name": "react-start.full",
            "value": 107716,
            "unit": "bytes",
            "extra": "raw=340674; brotli=93224"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156103; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56363,
            "unit": "bytes",
            "extra": "raw=172695; brotli=49561"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d3f20fbe7acf69c3bd108c5ddc9748ad47690b04",
          "message": "fix(start-plugin-core): reuse deduped server function ids across compilers (#7153)",
          "timestamp": "2026-04-11T16:37:33+02:00",
          "tree_id": "e5f4e7ee295862a1079cc2992a4f62d2781fe0c6",
          "url": "https://github.com/TanStack/router/commit/d3f20fbe7acf69c3bd108c5ddc9748ad47690b04"
        },
        "date": 1775918390340,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89437,
            "unit": "bytes",
            "extra": "raw=281225; brotli=77740"
          },
          {
            "name": "react-router.full",
            "value": 92790,
            "unit": "bytes",
            "extra": "raw=292564; brotli=80637"
          },
          {
            "name": "solid-router.minimal",
            "value": 36386,
            "unit": "bytes",
            "extra": "raw=109195; brotli=32746"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123009; brotli=36723"
          },
          {
            "name": "vue-router.minimal",
            "value": 54592,
            "unit": "bytes",
            "extra": "raw=155690; brotli=49034"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171481; brotli=53320"
          },
          {
            "name": "react-start.minimal",
            "value": 104189,
            "unit": "bytes",
            "extra": "raw=330095; brotli=90079"
          },
          {
            "name": "react-start.full",
            "value": 107716,
            "unit": "bytes",
            "extra": "raw=340674; brotli=93224"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156103; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56363,
            "unit": "bytes",
            "extra": "raw=172695; brotli=49561"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "brenleydueck@gmail.com",
            "name": "Brenley Dueck",
            "username": "brenelz"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8ec9ca97b472779de878c2a6510f21deb24d386c",
          "message": "fix(router-core): avoid false notFound matches for proxied loader data (#7156)\n\n* fix(router-core): avoid false notFound matches for proxied loader data\n\n* test(react-start): cover proxied loader data notFound regression\n\n* test(react-start): move notFound regression to rsc direct loader\n\n* chore: add changeset",
          "timestamp": "2026-04-11T19:34:02+02:00",
          "tree_id": "19796d2d544f151d6504ee1d69eeb592b115f220",
          "url": "https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c"
        },
        "date": 1775928984396,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89436,
            "unit": "bytes",
            "extra": "raw=281229; brotli=77707"
          },
          {
            "name": "react-router.full",
            "value": 92789,
            "unit": "bytes",
            "extra": "raw=292568; brotli=80613"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=109199; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123013; brotli=36740"
          },
          {
            "name": "vue-router.minimal",
            "value": 54591,
            "unit": "bytes",
            "extra": "raw=155694; brotli=49057"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171485; brotli=53362"
          },
          {
            "name": "react-start.minimal",
            "value": 104188,
            "unit": "bytes",
            "extra": "raw=330099; brotli=90072"
          },
          {
            "name": "react-start.full",
            "value": 107714,
            "unit": "bytes",
            "extra": "raw=340678; brotli=93047"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156107; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56364,
            "unit": "bytes",
            "extra": "raw=172699; brotli=49619"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "812792fbda3caf97b300770855cf5641252f413b",
          "message": "fix: reduce start SSR manifest asset duplication (#7157)\n\nCo-authored-by: schiller-manuel <schiller-manuel@users.noreply.github.com>\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-11T20:15:35+02:00",
          "tree_id": "247b9807e7f09d04403cc42142fb1788ca7521d8",
          "url": "https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b"
        },
        "date": 1775931477754,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89436,
            "unit": "bytes",
            "extra": "raw=281229; brotli=77707"
          },
          {
            "name": "react-router.full",
            "value": 92789,
            "unit": "bytes",
            "extra": "raw=292568; brotli=80613"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=109199; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123013; brotli=36740"
          },
          {
            "name": "vue-router.minimal",
            "value": 54591,
            "unit": "bytes",
            "extra": "raw=155694; brotli=49057"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171485; brotli=53362"
          },
          {
            "name": "react-start.minimal",
            "value": 104188,
            "unit": "bytes",
            "extra": "raw=330099; brotli=90072"
          },
          {
            "name": "react-start.full",
            "value": 107714,
            "unit": "bytes",
            "extra": "raw=340678; brotli=93047"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156107; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56364,
            "unit": "bytes",
            "extra": "raw=172699; brotli=49619"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0e2c9003c18ae07c09969189c028f277ea562a7a",
          "message": "chore: bump to h3 v2 rc.20 (#7140)",
          "timestamp": "2026-04-11T23:32:39+02:00",
          "tree_id": "ffb7b903125ab6a4b8b99cba39e05051c80fa391",
          "url": "https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a"
        },
        "date": 1775943297688,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89436,
            "unit": "bytes",
            "extra": "raw=281229; brotli=77707"
          },
          {
            "name": "react-router.full",
            "value": 92789,
            "unit": "bytes",
            "extra": "raw=292568; brotli=80613"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=109199; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123013; brotli=36740"
          },
          {
            "name": "vue-router.minimal",
            "value": 54591,
            "unit": "bytes",
            "extra": "raw=155694; brotli=49057"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171485; brotli=53362"
          },
          {
            "name": "react-start.minimal",
            "value": 104188,
            "unit": "bytes",
            "extra": "raw=330099; brotli=90072"
          },
          {
            "name": "react-start.full",
            "value": 107714,
            "unit": "bytes",
            "extra": "raw=340678; brotli=93047"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156107; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56364,
            "unit": "bytes",
            "extra": "raw=172699; brotli=49619"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "656a2a040e79df7721d776e3751c8d634666570b",
          "message": "chore: add vite 8 to peer deps (#7160)\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-12T02:29:41+02:00",
          "tree_id": "5194aa53ef83cd9c7a2f830a6202b753a005c537",
          "url": "https://github.com/TanStack/router/commit/656a2a040e79df7721d776e3751c8d634666570b"
        },
        "date": 1775953918672,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89436,
            "unit": "bytes",
            "extra": "raw=281229; brotli=77707"
          },
          {
            "name": "react-router.full",
            "value": 92789,
            "unit": "bytes",
            "extra": "raw=292568; brotli=80613"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=109199; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123013; brotli=36740"
          },
          {
            "name": "vue-router.minimal",
            "value": 54591,
            "unit": "bytes",
            "extra": "raw=155694; brotli=49057"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171485; brotli=53362"
          },
          {
            "name": "react-start.minimal",
            "value": 104188,
            "unit": "bytes",
            "extra": "raw=330099; brotli=90072"
          },
          {
            "name": "react-start.full",
            "value": 107714,
            "unit": "bytes",
            "extra": "raw=340678; brotli=93047"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156107; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56364,
            "unit": "bytes",
            "extra": "raw=172699; brotli=49619"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "github@ustark.de",
            "name": "Ulrich Stark",
            "username": "ulrichstark"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5b8480d251b636c6febeafa4fd9f2f80fcd1abba",
          "message": "chore(start-server-core): remove unnecessary `any` in `getRequestHeaders` (#7164)",
          "timestamp": "2026-04-12T23:05:11+02:00",
          "tree_id": "b405b393473e3f3174cbc0def21efbc6b1981299",
          "url": "https://github.com/TanStack/router/commit/5b8480d251b636c6febeafa4fd9f2f80fcd1abba"
        },
        "date": 1776028051821,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89436,
            "unit": "bytes",
            "extra": "raw=281229; brotli=77707"
          },
          {
            "name": "react-router.full",
            "value": 92789,
            "unit": "bytes",
            "extra": "raw=292568; brotli=80613"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=109199; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 40948,
            "unit": "bytes",
            "extra": "raw=123013; brotli=36740"
          },
          {
            "name": "vue-router.minimal",
            "value": 54591,
            "unit": "bytes",
            "extra": "raw=155694; brotli=49057"
          },
          {
            "name": "vue-router.full",
            "value": 59602,
            "unit": "bytes",
            "extra": "raw=171485; brotli=53362"
          },
          {
            "name": "react-start.minimal",
            "value": 104188,
            "unit": "bytes",
            "extra": "raw=330099; brotli=90072"
          },
          {
            "name": "react-start.full",
            "value": 107714,
            "unit": "bytes",
            "extra": "raw=340678; brotli=93047"
          },
          {
            "name": "solid-start.minimal",
            "value": 50722,
            "unit": "bytes",
            "extra": "raw=156107; brotli=44717"
          },
          {
            "name": "solid-start.full",
            "value": 56364,
            "unit": "bytes",
            "extra": "raw=172699; brotli=49619"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "105d05691a247779a63e7b688aa1207cce619339",
          "message": "fix(router-generator): harden route file transform rewrites (#7167)",
          "timestamp": "2026-04-13T02:20:50+02:00",
          "tree_id": "859cddc76857b0a70cab062cfe8c1df4022a783c",
          "url": "https://github.com/TanStack/router/commit/105d05691a247779a63e7b688aa1207cce619339"
        },
        "date": 1776039792971,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89427,
            "unit": "bytes",
            "extra": "raw=281173; brotli=77797"
          },
          {
            "name": "react-router.full",
            "value": 92769,
            "unit": "bytes",
            "extra": "raw=292512; brotli=80607"
          },
          {
            "name": "solid-router.minimal",
            "value": 36356,
            "unit": "bytes",
            "extra": "raw=109143; brotli=32641"
          },
          {
            "name": "solid-router.full",
            "value": 40938,
            "unit": "bytes",
            "extra": "raw=122957; brotli=36793"
          },
          {
            "name": "vue-router.minimal",
            "value": 54575,
            "unit": "bytes",
            "extra": "raw=155638; brotli=49009"
          },
          {
            "name": "vue-router.full",
            "value": 59587,
            "unit": "bytes",
            "extra": "raw=171429; brotli=53341"
          },
          {
            "name": "react-start.minimal",
            "value": 104175,
            "unit": "bytes",
            "extra": "raw=330043; brotli=90046"
          },
          {
            "name": "react-start.full",
            "value": 107695,
            "unit": "bytes",
            "extra": "raw=340622; brotli=93019"
          },
          {
            "name": "solid-start.minimal",
            "value": 50693,
            "unit": "bytes",
            "extra": "raw=156051; brotli=44672"
          },
          {
            "name": "solid-start.full",
            "value": 56348,
            "unit": "bytes",
            "extra": "raw=172643; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "96ac2d8ed378340d63b88afeec3633e56e29b5f8",
          "message": "fix(router-plugin): update vite-plugin-solid peer dependency to support version 3.0.0-0 (#7170)",
          "timestamp": "2026-04-13T04:09:58+02:00",
          "tree_id": "c8493aec3d2f437c0ec6aa968b12a45f80bfaa83",
          "url": "https://github.com/TanStack/router/commit/96ac2d8ed378340d63b88afeec3633e56e29b5f8"
        },
        "date": 1776046328383,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89427,
            "unit": "bytes",
            "extra": "raw=281173; brotli=77797"
          },
          {
            "name": "react-router.full",
            "value": 92769,
            "unit": "bytes",
            "extra": "raw=292512; brotli=80607"
          },
          {
            "name": "solid-router.minimal",
            "value": 36356,
            "unit": "bytes",
            "extra": "raw=109143; brotli=32641"
          },
          {
            "name": "solid-router.full",
            "value": 40938,
            "unit": "bytes",
            "extra": "raw=122957; brotli=36793"
          },
          {
            "name": "vue-router.minimal",
            "value": 54575,
            "unit": "bytes",
            "extra": "raw=155638; brotli=49009"
          },
          {
            "name": "vue-router.full",
            "value": 59587,
            "unit": "bytes",
            "extra": "raw=171429; brotli=53341"
          },
          {
            "name": "react-start.minimal",
            "value": 104175,
            "unit": "bytes",
            "extra": "raw=330043; brotli=90046"
          },
          {
            "name": "react-start.full",
            "value": 107695,
            "unit": "bytes",
            "extra": "raw=340622; brotli=93019"
          },
          {
            "name": "solid-start.minimal",
            "value": 50693,
            "unit": "bytes",
            "extra": "raw=156051; brotli=44672"
          },
          {
            "name": "solid-start.full",
            "value": 56348,
            "unit": "bytes",
            "extra": "raw=172643; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "328d7e5ebc6b8074242a07d68ccafafb83e37a0e",
          "message": "fix(router-generator): normalize virtual physical subtree paths (#7169)\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>",
          "timestamp": "2026-04-13T21:10:40+02:00",
          "tree_id": "c61d46f336738780b7b328266d740e88a0f0f985",
          "url": "https://github.com/TanStack/router/commit/328d7e5ebc6b8074242a07d68ccafafb83e37a0e"
        },
        "date": 1776107592694,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89427,
            "unit": "bytes",
            "extra": "raw=281173; brotli=77797"
          },
          {
            "name": "react-router.full",
            "value": 92769,
            "unit": "bytes",
            "extra": "raw=292512; brotli=80607"
          },
          {
            "name": "solid-router.minimal",
            "value": 36356,
            "unit": "bytes",
            "extra": "raw=109143; brotli=32641"
          },
          {
            "name": "solid-router.full",
            "value": 40938,
            "unit": "bytes",
            "extra": "raw=122957; brotli=36793"
          },
          {
            "name": "vue-router.minimal",
            "value": 54575,
            "unit": "bytes",
            "extra": "raw=155638; brotli=49009"
          },
          {
            "name": "vue-router.full",
            "value": 59587,
            "unit": "bytes",
            "extra": "raw=171429; brotli=53341"
          },
          {
            "name": "react-start.minimal",
            "value": 104175,
            "unit": "bytes",
            "extra": "raw=330043; brotli=90046"
          },
          {
            "name": "react-start.full",
            "value": 107695,
            "unit": "bytes",
            "extra": "raw=340622; brotli=93019"
          },
          {
            "name": "solid-start.minimal",
            "value": 50693,
            "unit": "bytes",
            "extra": "raw=156051; brotli=44672"
          },
          {
            "name": "solid-start.full",
            "value": 56348,
            "unit": "bytes",
            "extra": "raw=172643; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a581680a27530469751b8ab419ada9ce66da4ffe",
          "message": "fix: unify virtual module handling for Start Vite plugins (#7178)\n\nCo-authored-by: coderabbitai[bot] <136622811+coderabbitai[bot]@users.noreply.github.com>\nCo-authored-by: CodeRabbit <noreply@coderabbit.ai>\nCo-authored-by: schiller-manuel <schiller-manuel@users.noreply.github.com>\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-13T22:35:58+02:00",
          "tree_id": "582d6f176cbebdff6479a1af830f2cc00ad97f26",
          "url": "https://github.com/TanStack/router/commit/a581680a27530469751b8ab419ada9ce66da4ffe"
        },
        "date": 1776112692055,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89427,
            "unit": "bytes",
            "extra": "raw=281173; brotli=77797"
          },
          {
            "name": "react-router.full",
            "value": 92769,
            "unit": "bytes",
            "extra": "raw=292512; brotli=80607"
          },
          {
            "name": "solid-router.minimal",
            "value": 36356,
            "unit": "bytes",
            "extra": "raw=109143; brotli=32641"
          },
          {
            "name": "solid-router.full",
            "value": 40938,
            "unit": "bytes",
            "extra": "raw=122957; brotli=36793"
          },
          {
            "name": "vue-router.minimal",
            "value": 54575,
            "unit": "bytes",
            "extra": "raw=155638; brotli=49009"
          },
          {
            "name": "vue-router.full",
            "value": 59587,
            "unit": "bytes",
            "extra": "raw=171429; brotli=53341"
          },
          {
            "name": "react-start.minimal",
            "value": 104175,
            "unit": "bytes",
            "extra": "raw=330043; brotli=90046"
          },
          {
            "name": "react-start.full",
            "value": 107695,
            "unit": "bytes",
            "extra": "raw=340622; brotli=93019"
          },
          {
            "name": "solid-start.minimal",
            "value": 50693,
            "unit": "bytes",
            "extra": "raw=156051; brotli=44672"
          },
          {
            "name": "solid-start.full",
            "value": 56348,
            "unit": "bytes",
            "extra": "raw=172643; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7324b98d114ba5ec28e5481dc1b0f023d781d1a6",
          "message": "fix: add react-server server export for react-start (#7180)",
          "timestamp": "2026-04-13T23:01:35+02:00",
          "tree_id": "698e26401cb81f0a85548bb3a84a5533bcbfbaa9",
          "url": "https://github.com/TanStack/router/commit/7324b98d114ba5ec28e5481dc1b0f023d781d1a6"
        },
        "date": 1776114252131,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89427,
            "unit": "bytes",
            "extra": "raw=281173; brotli=77797"
          },
          {
            "name": "react-router.full",
            "value": 92769,
            "unit": "bytes",
            "extra": "raw=292512; brotli=80607"
          },
          {
            "name": "solid-router.minimal",
            "value": 36356,
            "unit": "bytes",
            "extra": "raw=109143; brotli=32641"
          },
          {
            "name": "solid-router.full",
            "value": 40938,
            "unit": "bytes",
            "extra": "raw=122957; brotli=36793"
          },
          {
            "name": "vue-router.minimal",
            "value": 54575,
            "unit": "bytes",
            "extra": "raw=155638; brotli=49009"
          },
          {
            "name": "vue-router.full",
            "value": 59587,
            "unit": "bytes",
            "extra": "raw=171429; brotli=53341"
          },
          {
            "name": "react-start.minimal",
            "value": 104175,
            "unit": "bytes",
            "extra": "raw=330043; brotli=90046"
          },
          {
            "name": "react-start.full",
            "value": 107695,
            "unit": "bytes",
            "extra": "raw=340622; brotli=93019"
          },
          {
            "name": "solid-start.minimal",
            "value": 50693,
            "unit": "bytes",
            "extra": "raw=156051; brotli=44672"
          },
          {
            "name": "solid-start.full",
            "value": 56348,
            "unit": "bytes",
            "extra": "raw=172643; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c5ad32936f6adcca0c56474677b73b212498443b",
          "message": "fix react server exports for start and react-router (#7183)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-14T00:48:18+02:00",
          "tree_id": "ffe5494754a53ae6ba40da23a23b1d4fa860272f",
          "url": "https://github.com/TanStack/router/commit/c5ad32936f6adcca0c56474677b73b212498443b"
        },
        "date": 1776120625510,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89427,
            "unit": "bytes",
            "extra": "raw=281173; brotli=77797"
          },
          {
            "name": "react-router.full",
            "value": 92769,
            "unit": "bytes",
            "extra": "raw=292512; brotli=80607"
          },
          {
            "name": "solid-router.minimal",
            "value": 36356,
            "unit": "bytes",
            "extra": "raw=109143; brotli=32641"
          },
          {
            "name": "solid-router.full",
            "value": 40938,
            "unit": "bytes",
            "extra": "raw=122957; brotli=36793"
          },
          {
            "name": "vue-router.minimal",
            "value": 54575,
            "unit": "bytes",
            "extra": "raw=155638; brotli=49009"
          },
          {
            "name": "vue-router.full",
            "value": 59587,
            "unit": "bytes",
            "extra": "raw=171429; brotli=53341"
          },
          {
            "name": "react-start.minimal",
            "value": 104175,
            "unit": "bytes",
            "extra": "raw=330043; brotli=90046"
          },
          {
            "name": "react-start.full",
            "value": 107695,
            "unit": "bytes",
            "extra": "raw=340622; brotli=93019"
          },
          {
            "name": "solid-start.minimal",
            "value": 50693,
            "unit": "bytes",
            "extra": "raw=156051; brotli=44672"
          },
          {
            "name": "solid-start.full",
            "value": 56348,
            "unit": "bytes",
            "extra": "raw=172643; brotli=49576"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "16f6892d6b7ceadf606677c5a40e743f29163aa6",
          "message": "fix(router-core): avoid intermediate success state for async notFound (#7184)",
          "timestamp": "2026-04-14T01:16:42+02:00",
          "tree_id": "9a884c4e8ef618ab0305414335e5a77d38128372",
          "url": "https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6"
        },
        "date": 1776122339337,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92775,
            "unit": "bytes",
            "extra": "raw=292529; brotli=80646"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109159; brotli=32671"
          },
          {
            "name": "solid-router.full",
            "value": 40945,
            "unit": "bytes",
            "extra": "raw=122973; brotli=36797"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104185,
            "unit": "bytes",
            "extra": "raw=330060; brotli=90090"
          },
          {
            "name": "react-start.full",
            "value": 107704,
            "unit": "bytes",
            "extra": "raw=340639; brotli=93152"
          },
          {
            "name": "solid-start.minimal",
            "value": 50706,
            "unit": "bytes",
            "extra": "raw=156067; brotli=44707"
          },
          {
            "name": "solid-start.full",
            "value": 56356,
            "unit": "bytes",
            "extra": "raw=172660; brotli=49607"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "108333654+CodingCossack@users.noreply.github.com",
            "name": "Coding Cossack",
            "username": "CodingCossack"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8caa20223e876129afa3ee51881fb3aefe5dc065",
          "message": "Add a React Start server-components skill (#7181)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-14T01:33:37+02:00",
          "tree_id": "c3e71b6c0d3a7631f4ebb76b27fbc86b67919365",
          "url": "https://github.com/TanStack/router/commit/8caa20223e876129afa3ee51881fb3aefe5dc065"
        },
        "date": 1776123350182,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92775,
            "unit": "bytes",
            "extra": "raw=292529; brotli=80646"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109159; brotli=32671"
          },
          {
            "name": "solid-router.full",
            "value": 40945,
            "unit": "bytes",
            "extra": "raw=122973; brotli=36797"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104185,
            "unit": "bytes",
            "extra": "raw=330060; brotli=90090"
          },
          {
            "name": "react-start.full",
            "value": 107704,
            "unit": "bytes",
            "extra": "raw=340639; brotli=93152"
          },
          {
            "name": "solid-start.minimal",
            "value": 50706,
            "unit": "bytes",
            "extra": "raw=156067; brotli=44707"
          },
          {
            "name": "solid-start.full",
            "value": 56356,
            "unit": "bytes",
            "extra": "raw=172660; brotli=49607"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e30814d949110ff25829de44d729ead47555940a",
          "message": "fix react-router shared route css persistence on nav (#7186)\n\nCo-authored-by: coderabbitai[bot] <136622811+coderabbitai[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-15T02:19:51+02:00",
          "tree_id": "d7f117f2d0fa48f9c395b322bacbdbde231cdca1",
          "url": "https://github.com/TanStack/router/commit/e30814d949110ff25829de44d729ead47555940a"
        },
        "date": 1776212525429,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109159; brotli=32671"
          },
          {
            "name": "solid-router.full",
            "value": 40945,
            "unit": "bytes",
            "extra": "raw=122973; brotli=36797"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50706,
            "unit": "bytes",
            "extra": "raw=156067; brotli=44707"
          },
          {
            "name": "solid-start.full",
            "value": 56356,
            "unit": "bytes",
            "extra": "raw=172660; brotli=49607"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f7f00250f39cf0276a984558e5d427e9270d9635",
          "message": "fix(start): include Vite style.css when cssCodeSplit is disabled (#7191)\n\nCo-authored-by: coderabbitai[bot] <136622811+coderabbitai[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-15T04:23:56+02:00",
          "tree_id": "1c1814082242b0ba052179d5e024ac19248a341e",
          "url": "https://github.com/TanStack/router/commit/f7f00250f39cf0276a984558e5d427e9270d9635"
        },
        "date": 1776220032718,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36362,
            "unit": "bytes",
            "extra": "raw=109159; brotli=32671"
          },
          {
            "name": "solid-router.full",
            "value": 40945,
            "unit": "bytes",
            "extra": "raw=122973; brotli=36797"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50706,
            "unit": "bytes",
            "extra": "raw=156067; brotli=44707"
          },
          {
            "name": "solid-start.full",
            "value": 56356,
            "unit": "bytes",
            "extra": "raw=172660; brotli=49607"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3d4b15b4ea77fc99b9df285ea9c54b922709852c",
          "message": "chore: bump query override to 5.99.0 (#7203)",
          "timestamp": "2026-04-16T21:22:12+02:00",
          "tree_id": "b9452910a731f0a805f5434ad4b1fdd27b3722da",
          "url": "https://github.com/TanStack/router/commit/3d4b15b4ea77fc99b9df285ea9c54b922709852c"
        },
        "date": 1776367464930,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36386,
            "unit": "bytes",
            "extra": "raw=109220; brotli=32694"
          },
          {
            "name": "solid-router.full",
            "value": 40970,
            "unit": "bytes",
            "extra": "raw=123034; brotli=36737"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50721,
            "unit": "bytes",
            "extra": "raw=156128; brotli=44758"
          },
          {
            "name": "solid-start.full",
            "value": 56377,
            "unit": "bytes",
            "extra": "raw=172721; brotli=49598"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "22dc15203379da15e6eaa225e61696039380aedd",
          "message": "fix(solid-router): use keyed Show in Outlet to fix child route rendering with useQuery (#7204)",
          "timestamp": "2026-04-16T23:51:45+02:00",
          "tree_id": "d9be8947eed13f884f4d2eba64bc0c8c4e9f2923",
          "url": "https://github.com/TanStack/router/commit/22dc15203379da15e6eaa225e61696039380aedd"
        },
        "date": 1776376449921,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b57e898e676654b056567f4097b9557b787b025c",
          "message": "chore(deps): vitest 4.1.4 (#7212)",
          "timestamp": "2026-04-17T21:19:38+02:00",
          "tree_id": "88ea727c765d97c4c4aa8301f25661c71fbc5e9c",
          "url": "https://github.com/TanStack/router/commit/b57e898e676654b056567f4097b9557b787b025c"
        },
        "date": 1776453708999,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "52622705+mixelburg@users.noreply.github.com",
            "name": "mixelburg",
            "username": "mixelburg"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cd91ceebb84b7b752b5ee09ac14e89ad2beb2259",
          "message": "fix(react-router): prevent webpack static analysis of React.use with let binding (#7182)",
          "timestamp": "2026-04-18T21:55:58+02:00",
          "tree_id": "93fe23291af6e9de2eea71bf70fb65271a13bf68",
          "url": "https://github.com/TanStack/router/commit/cd91ceebb84b7b752b5ee09ac14e89ad2beb2259"
        },
        "date": 1776542297096,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "91a708989d00537a21911e74ff60bbfec8266295",
          "message": "rsbuild plugin (#7228)\n\nCo-authored-by: neverland <chenjiahan.jait@bytedance.com>\nCo-authored-by: Keven Arroyo <dake.3601@gmail.com>",
          "timestamp": "2026-04-24T03:26:03+02:00",
          "tree_id": "c3a7eebf316b2568170a5521984680b510f6d855",
          "url": "https://github.com/TanStack/router/commit/91a708989d00537a21911e74ff60bbfec8266295"
        },
        "date": 1776994110630,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "dda463c8b571519165d3adbc337db7a0b8be1072",
          "message": "fix: Split Start plugin core (#7249)",
          "timestamp": "2026-04-24T20:33:33+02:00",
          "tree_id": "f390f02b9c0a1c894a7adfc5f4b6d197f1f73323",
          "url": "https://github.com/TanStack/router/commit/dda463c8b571519165d3adbc337db7a0b8be1072"
        },
        "date": 1777055764743,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9252206e5aeafe53e31eb7baa491d07a597c4dc6",
          "message": "fix: asset sorting (#7251)",
          "timestamp": "2026-04-24T22:29:13+02:00",
          "tree_id": "969481561d1bc6448823fc7abb7c8be208cf9671",
          "url": "https://github.com/TanStack/router/commit/9252206e5aeafe53e31eb7baa491d07a597c4dc6"
        },
        "date": 1777062692471,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "chenjiahan.jait@bytedance.com",
            "name": "neverland",
            "username": "chenjiahan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a5385dbd90a8662d58abce7e437d3a4f3ff85b71",
          "message": "chore(deps): update Rsbuild related deps to v2.0.1 (#7245)",
          "timestamp": "2026-04-24T22:41:31+02:00",
          "tree_id": "f1237b7c269dd7938d6661d035a013a0a05656f7",
          "url": "https://github.com/TanStack/router/commit/a5385dbd90a8662d58abce7e437d3a4f3ff85b71"
        },
        "date": 1777063466289,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92803,
            "unit": "bytes",
            "extra": "raw=292596; brotli=80767"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 40978,
            "unit": "bytes",
            "extra": "raw=123089; brotli=36807"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59593,
            "unit": "bytes",
            "extra": "raw=171446; brotli=53314"
          },
          {
            "name": "react-start.minimal",
            "value": 104210,
            "unit": "bytes",
            "extra": "raw=330127; brotli=90164"
          },
          {
            "name": "react-start.full",
            "value": 107732,
            "unit": "bytes",
            "extra": "raw=340706; brotli=93073"
          },
          {
            "name": "solid-start.minimal",
            "value": 50718,
            "unit": "bytes",
            "extra": "raw=156181; brotli=44726"
          },
          {
            "name": "solid-start.full",
            "value": 56395,
            "unit": "bytes",
            "extra": "raw=172776; brotli=49588"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4d864eebbd184265eabb563d326ab409c93feb17",
          "message": "inline css (#7253)",
          "timestamp": "2026-04-25T01:20:36+02:00",
          "tree_id": "e24a9eec9c4006776550a066b1dc88ef3b0e89f0",
          "url": "https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17"
        },
        "date": 1777072982255,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41144,
            "unit": "bytes",
            "extra": "raw=123475; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56563,
            "unit": "bytes",
            "extra": "raw=173162; brotli=49761"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1e371b60f1832c158ff4953a4ae6c5ccfe8460b3",
          "message": "fix: do not import 'react-refresh/runtime' (#7255)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-25T01:45:22+02:00",
          "tree_id": "89c56abcb0c08920be4f9e519dd58b8693a7c222",
          "url": "https://github.com/TanStack/router/commit/1e371b60f1832c158ff4953a4ae6c5ccfe8460b3"
        },
        "date": 1777074465986,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41144,
            "unit": "bytes",
            "extra": "raw=123475; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56563,
            "unit": "bytes",
            "extra": "raw=173162; brotli=49761"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8adbe7415d2e93c51a13eb479213edc305224b6b",
          "message": "add new bundlesize measurements for rsbuild (#7256)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-25T03:33:45+02:00",
          "tree_id": "1e45e6105c2bc94bf466d34ddcd7d649eb04cc1f",
          "url": "https://github.com/TanStack/router/commit/8adbe7415d2e93c51a13eb479213edc305224b6b"
        },
        "date": 1777080970983,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41144,
            "unit": "bytes",
            "extra": "raw=123475; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103860,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89101"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344387; brotli=92078"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56563,
            "unit": "bytes",
            "extra": "raw=173162; brotli=49761"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "33615041+SeanCassiere@users.noreply.github.com",
            "name": "Sean Cassiere",
            "username": "SeanCassiere"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8b97002af3f6d15204e60c55d3f5735b78bd7efe",
          "message": "refactor(router-plugin): upgrade unplugin to `v3` (#7258)\n\n* refactor(router-plugin): upgrade unplugin to `v3`\n\n* refactor(start-client-core): use a more explicit typing to `CustomFetch` type\n\n* chore(examples): runtime enforce for needing the `VITE_CONVEX_URL`",
          "timestamp": "2026-04-25T14:07:00+12:00",
          "tree_id": "8c8bf643e565506fa8338169350e36c56cab3059",
          "url": "https://github.com/TanStack/router/commit/8b97002af3f6d15204e60c55d3f5735b78bd7efe"
        },
        "date": 1777082970307,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41144,
            "unit": "bytes",
            "extra": "raw=123475; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56563,
            "unit": "bytes",
            "extra": "raw=173162; brotli=49761"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "brenleydueck@gmail.com",
            "name": "Brenley Dueck",
            "username": "brenelz"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d20c87813559ff00d0b4810c4b600d47b47eff2f",
          "message": "fix: issue 7240 causing fouc (#7250)",
          "timestamp": "2026-04-25T18:25:42+02:00",
          "tree_id": "6c6a40e392849b6c4f83d999059a44e4539a7d8c",
          "url": "https://github.com/TanStack/router/commit/d20c87813559ff00d0b4810c4b600d47b47eff2f"
        },
        "date": 1777134478997,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41214,
            "unit": "bytes",
            "extra": "raw=123687; brotli=36976"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56626,
            "unit": "bytes",
            "extra": "raw=173374; brotli=49779"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "brenleydueck@gmail.com",
            "name": "Brenley Dueck",
            "username": "brenelz"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b732c8ac26bd3b316e95b026ca2fc7c2c78a1ddd",
          "message": "fix: server middleware type in solid-router (#7260)",
          "timestamp": "2026-04-25T19:23:05+02:00",
          "tree_id": "8d37c96e529c144c3ae2c07d4a4cadcbbb6076d9",
          "url": "https://github.com/TanStack/router/commit/b732c8ac26bd3b316e95b026ca2fc7c2c78a1ddd"
        },
        "date": 1777137940654,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41214,
            "unit": "bytes",
            "extra": "raw=123687; brotli=36976"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56626,
            "unit": "bytes",
            "extra": "raw=173374; brotli=49779"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a2ad394598e2079ab4050ebb16bb03b31d69c32a",
          "message": "replace tsx by jiti (#7261)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-25T19:30:52+02:00",
          "tree_id": "a840bb04f879e5f254b22d55242fc56dbdcb1f96",
          "url": "https://github.com/TanStack/router/commit/a2ad394598e2079ab4050ebb16bb03b31d69c32a"
        },
        "date": 1777138499605,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41214,
            "unit": "bytes",
            "extra": "raw=123687; brotli=36976"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56626,
            "unit": "bytes",
            "extra": "raw=173374; brotli=49779"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "office@dorfmeister.cc",
            "name": "Dominik Dorfmeister 🔮",
            "username": "TkDodo"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b12f57bbb44e47d5452d46e9e67ea4d63cdb5b55",
          "message": "feat(query): add support for custom dehydrate and hydrate options in SSR integration (#7246)\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-25T22:17:12+02:00",
          "tree_id": "48dde7d55d45cb95065c5b20934e681ec5dde4d1",
          "url": "https://github.com/TanStack/router/commit/b12f57bbb44e47d5452d46e9e67ea4d63cdb5b55"
        },
        "date": 1777148372529,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36400,
            "unit": "bytes",
            "extra": "raw=109275; brotli=32723"
          },
          {
            "name": "solid-router.full",
            "value": 41214,
            "unit": "bytes",
            "extra": "raw=123687; brotli=36976"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50733,
            "unit": "bytes",
            "extra": "raw=156202; brotli=44721"
          },
          {
            "name": "solid-start.full",
            "value": 56626,
            "unit": "bytes",
            "extra": "raw=173374; brotli=49779"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "brenleydueck@gmail.com",
            "name": "Brenley Dueck",
            "username": "brenelz"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "41e37f8a9c3d2a6e00e4ca6faabb6a596bc36a98",
          "message": "fix: use loader data goes undefined (#7265)",
          "timestamp": "2026-04-25T23:36:25+02:00",
          "tree_id": "16384d83c2a89ea78d5306834ba684ea155265ac",
          "url": "https://github.com/TanStack/router/commit/41e37f8a9c3d2a6e00e4ca6faabb6a596bc36a98"
        },
        "date": 1777153134139,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36435,
            "unit": "bytes",
            "extra": "raw=109409; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 41244,
            "unit": "bytes",
            "extra": "raw=123821; brotli=36995"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50774,
            "unit": "bytes",
            "extra": "raw=156338; brotli=44737"
          },
          {
            "name": "solid-start.full",
            "value": 56648,
            "unit": "bytes",
            "extra": "raw=173508; brotli=49803"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "brenleydueck@gmail.com",
            "name": "Brenley Dueck",
            "username": "brenelz"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e054474cd1df6f93cd69dd5d255013840441438e",
          "message": "fix: streaming when using Await component (#7264)",
          "timestamp": "2026-04-26T01:00:37+02:00",
          "tree_id": "a6113b1da91a2660abd802e99fd3aff06d75b81a",
          "url": "https://github.com/TanStack/router/commit/e054474cd1df6f93cd69dd5d255013840441438e"
        },
        "date": 1777158179440,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36435,
            "unit": "bytes",
            "extra": "raw=109409; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 41288,
            "unit": "bytes",
            "extra": "raw=123963; brotli=37016"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50774,
            "unit": "bytes",
            "extra": "raw=156338; brotli=44737"
          },
          {
            "name": "solid-start.full",
            "value": 56691,
            "unit": "bytes",
            "extra": "raw=173650; brotli=49855"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aebf4264767a37989c559a6d75926cba76a437b0",
          "message": "fix(solid-start): bundle solid-query packages during SSR to fix duplicate QueryClientContext (#6151) (#7267)",
          "timestamp": "2026-04-26T04:07:56+02:00",
          "tree_id": "b59e191ac9884f0b1e15fafaeab7e16fd481ffec",
          "url": "https://github.com/TanStack/router/commit/aebf4264767a37989c559a6d75926cba76a437b0"
        },
        "date": 1777169480912,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36435,
            "unit": "bytes",
            "extra": "raw=109409; brotli=32727"
          },
          {
            "name": "solid-router.full",
            "value": 41288,
            "unit": "bytes",
            "extra": "raw=123963; brotli=37016"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50774,
            "unit": "bytes",
            "extra": "raw=156338; brotli=44737"
          },
          {
            "name": "solid-start.full",
            "value": 56691,
            "unit": "bytes",
            "extra": "raw=173650; brotli=49855"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "198982749+Copilot@users.noreply.github.com",
            "name": "Copilot",
            "username": "Copilot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "944b1558965bf038eaf3c0dfb9e1ac3800d6fd3a",
          "message": "fix(solid-router): hydration mismatch for ssr='data-only' with pendingComponent (#7266)",
          "timestamp": "2026-04-26T04:43:09+02:00",
          "tree_id": "0bc97091f156c7f5c55c8997aa17edb842b83ced",
          "url": "https://github.com/TanStack/router/commit/944b1558965bf038eaf3c0dfb9e1ac3800d6fd3a"
        },
        "date": 1777171540704,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89442,
            "unit": "bytes",
            "extra": "raw=281190; brotli=77791"
          },
          {
            "name": "react-router.full",
            "value": 92953,
            "unit": "bytes",
            "extra": "raw=292981; brotli=80794"
          },
          {
            "name": "solid-router.minimal",
            "value": 36435,
            "unit": "bytes",
            "extra": "raw=109423; brotli=32747"
          },
          {
            "name": "solid-router.full",
            "value": 41283,
            "unit": "bytes",
            "extra": "raw=123977; brotli=37133"
          },
          {
            "name": "vue-router.minimal",
            "value": 54582,
            "unit": "bytes",
            "extra": "raw=155655; brotli=49026"
          },
          {
            "name": "vue-router.full",
            "value": 59844,
            "unit": "bytes",
            "extra": "raw=172223; brotli=53599"
          },
          {
            "name": "react-start.minimal",
            "value": 104361,
            "unit": "bytes",
            "extra": "raw=330512; brotli=90297"
          },
          {
            "name": "react-start.full",
            "value": 107883,
            "unit": "bytes",
            "extra": "raw=341091; brotli=93203"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103868,
            "unit": "bytes",
            "extra": "raw=333433; brotli=89213"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107257,
            "unit": "bytes",
            "extra": "raw=344385; brotli=92091"
          },
          {
            "name": "solid-start.minimal",
            "value": 50775,
            "unit": "bytes",
            "extra": "raw=156352; brotli=44785"
          },
          {
            "name": "solid-start.full",
            "value": 56696,
            "unit": "bytes",
            "extra": "raw=173664; brotli=49885"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "493148bc5378b7f9de1544d87f6aaa425c12eb34",
          "message": "fix(router-core): wildcard nodes respect DFS priority like other nodes in route matching (#7273)",
          "timestamp": "2026-04-27T09:55:20+02:00",
          "tree_id": "ef89b098d909e7e512f8834688f3aea2c92eb9a9",
          "url": "https://github.com/TanStack/router/commit/493148bc5378b7f9de1544d87f6aaa425c12eb34"
        },
        "date": 1777276669704,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89400,
            "unit": "bytes",
            "extra": "raw=281268; brotli=77651"
          },
          {
            "name": "react-router.full",
            "value": 92977,
            "unit": "bytes",
            "extra": "raw=293055; brotli=80891"
          },
          {
            "name": "solid-router.minimal",
            "value": 36399,
            "unit": "bytes",
            "extra": "raw=109514; brotli=32739"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=124068; brotli=37025"
          },
          {
            "name": "vue-router.minimal",
            "value": 54577,
            "unit": "bytes",
            "extra": "raw=155742; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59847,
            "unit": "bytes",
            "extra": "raw=172310; brotli=53582"
          },
          {
            "name": "react-start.minimal",
            "value": 104367,
            "unit": "bytes",
            "extra": "raw=330586; brotli=90172"
          },
          {
            "name": "react-start.full",
            "value": 107871,
            "unit": "bytes",
            "extra": "raw=341165; brotli=93165"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103887,
            "unit": "bytes",
            "extra": "raw=333597; brotli=89209"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107272,
            "unit": "bytes",
            "extra": "raw=344549; brotli=92033"
          },
          {
            "name": "solid-start.minimal",
            "value": 50738,
            "unit": "bytes",
            "extra": "raw=156441; brotli=44725"
          },
          {
            "name": "solid-start.full",
            "value": 56661,
            "unit": "bytes",
            "extra": "raw=173755; brotli=49882"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "birk.skyum@pm.me",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "birk.skyum@pm.me",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "distinct": true,
          "id": "b0024d6310f123736ea18a7f8692b45265cdee74",
          "message": "Revert \"fix(solid-router): enable route component HMR for Solid\"\n\nThis reverts commit b86b06125364a2ec8207f599fb5a5130f9d16cc7.",
          "timestamp": "2026-04-27T21:18:08+02:00",
          "tree_id": "bb509ba99606e70769199c9ca202e9b6a28d3629",
          "url": "https://github.com/TanStack/router/commit/b0024d6310f123736ea18a7f8692b45265cdee74"
        },
        "date": 1777317653280,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89400,
            "unit": "bytes",
            "extra": "raw=281268; brotli=77651"
          },
          {
            "name": "react-router.full",
            "value": 92977,
            "unit": "bytes",
            "extra": "raw=293055; brotli=80891"
          },
          {
            "name": "solid-router.minimal",
            "value": 36399,
            "unit": "bytes",
            "extra": "raw=109514; brotli=32739"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=124068; brotli=37025"
          },
          {
            "name": "vue-router.minimal",
            "value": 54577,
            "unit": "bytes",
            "extra": "raw=155742; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59847,
            "unit": "bytes",
            "extra": "raw=172310; brotli=53582"
          },
          {
            "name": "react-start.minimal",
            "value": 104367,
            "unit": "bytes",
            "extra": "raw=330586; brotli=90172"
          },
          {
            "name": "react-start.full",
            "value": 107871,
            "unit": "bytes",
            "extra": "raw=341165; brotli=93165"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103887,
            "unit": "bytes",
            "extra": "raw=333597; brotli=89209"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107272,
            "unit": "bytes",
            "extra": "raw=344549; brotli=92033"
          },
          {
            "name": "solid-start.minimal",
            "value": 50738,
            "unit": "bytes",
            "extra": "raw=156441; brotli=44725"
          },
          {
            "name": "solid-start.full",
            "value": 56661,
            "unit": "bytes",
            "extra": "raw=173755; brotli=49882"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "kevenarroyo@microsoft.com",
            "name": "Keven Arroyo",
            "username": "dake3601"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d6decca41807e9ca28279e2db6640e7a8bdc1229",
          "message": "fix(react-start-rsc): re-export renderable types from public entries (#7278)\n\n* fix(react-start-rsc): re-export renderable types from public entries\n\n* changeset - patch",
          "timestamp": "2026-04-28T20:58:05+02:00",
          "tree_id": "4b4cd6c54db0e67b9daab204218b3f99793791b0",
          "url": "https://github.com/TanStack/router/commit/d6decca41807e9ca28279e2db6640e7a8bdc1229"
        },
        "date": 1777402838684,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89400,
            "unit": "bytes",
            "extra": "raw=281268; brotli=77651"
          },
          {
            "name": "react-router.full",
            "value": 92977,
            "unit": "bytes",
            "extra": "raw=293055; brotli=80891"
          },
          {
            "name": "solid-router.minimal",
            "value": 36399,
            "unit": "bytes",
            "extra": "raw=109514; brotli=32739"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=124068; brotli=37025"
          },
          {
            "name": "vue-router.minimal",
            "value": 54577,
            "unit": "bytes",
            "extra": "raw=155742; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59847,
            "unit": "bytes",
            "extra": "raw=172310; brotli=53582"
          },
          {
            "name": "react-start.minimal",
            "value": 104367,
            "unit": "bytes",
            "extra": "raw=330586; brotli=90172"
          },
          {
            "name": "react-start.full",
            "value": 107871,
            "unit": "bytes",
            "extra": "raw=341165; brotli=93165"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 103887,
            "unit": "bytes",
            "extra": "raw=333597; brotli=89209"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 107272,
            "unit": "bytes",
            "extra": "raw=344549; brotli=92033"
          },
          {
            "name": "solid-start.minimal",
            "value": 50738,
            "unit": "bytes",
            "extra": "raw=156441; brotli=44725"
          },
          {
            "name": "solid-start.full",
            "value": 56661,
            "unit": "bytes",
            "extra": "raw=173755; brotli=49882"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b5c4183ab8b44be8a75647b7f7b588ad7c146ece",
          "message": "fix: disabled topLevelVar (#7293)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-29T22:15:40+02:00",
          "tree_id": "558a2991240e80a8a70d1c3777f4753aa44067d5",
          "url": "https://github.com/TanStack/router/commit/b5c4183ab8b44be8a75647b7f7b588ad7c146ece"
        },
        "date": 1777493892525,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89400,
            "unit": "bytes",
            "extra": "raw=281268; brotli=77651"
          },
          {
            "name": "react-router.full",
            "value": 92977,
            "unit": "bytes",
            "extra": "raw=293055; brotli=80891"
          },
          {
            "name": "solid-router.minimal",
            "value": 36399,
            "unit": "bytes",
            "extra": "raw=109514; brotli=32739"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=124068; brotli=37025"
          },
          {
            "name": "vue-router.minimal",
            "value": 54577,
            "unit": "bytes",
            "extra": "raw=155742; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59847,
            "unit": "bytes",
            "extra": "raw=172310; brotli=53582"
          },
          {
            "name": "react-start.minimal",
            "value": 104367,
            "unit": "bytes",
            "extra": "raw=330586; brotli=90172"
          },
          {
            "name": "react-start.full",
            "value": 107871,
            "unit": "bytes",
            "extra": "raw=341165; brotli=93165"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101918,
            "unit": "bytes",
            "extra": "raw=324772; brotli=87679"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105312,
            "unit": "bytes",
            "extra": "raw=335455; brotli=90528"
          },
          {
            "name": "solid-start.minimal",
            "value": 50738,
            "unit": "bytes",
            "extra": "raw=156441; brotli=44725"
          },
          {
            "name": "solid-start.full",
            "value": 56661,
            "unit": "bytes",
            "extra": "raw=173755; brotli=49882"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7fa0f39cabf4407aa1cb99e369566e8ea85554a2",
          "message": "fix: fix exports for react-start so useServerFn is available with RSC (#7292)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-29T22:22:15+02:00",
          "tree_id": "af02dbfa869114d08bd45d625fa8aee84faf0920",
          "url": "https://github.com/TanStack/router/commit/7fa0f39cabf4407aa1cb99e369566e8ea85554a2"
        },
        "date": 1777494312445,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89400,
            "unit": "bytes",
            "extra": "raw=281268; brotli=77651"
          },
          {
            "name": "react-router.full",
            "value": 92977,
            "unit": "bytes",
            "extra": "raw=293055; brotli=80891"
          },
          {
            "name": "solid-router.minimal",
            "value": 36399,
            "unit": "bytes",
            "extra": "raw=109514; brotli=32739"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=124068; brotli=37025"
          },
          {
            "name": "vue-router.minimal",
            "value": 54577,
            "unit": "bytes",
            "extra": "raw=155742; brotli=49028"
          },
          {
            "name": "vue-router.full",
            "value": 59847,
            "unit": "bytes",
            "extra": "raw=172310; brotli=53582"
          },
          {
            "name": "react-start.minimal",
            "value": 104367,
            "unit": "bytes",
            "extra": "raw=330586; brotli=90172"
          },
          {
            "name": "react-start.full",
            "value": 107871,
            "unit": "bytes",
            "extra": "raw=341165; brotli=93165"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101918,
            "unit": "bytes",
            "extra": "raw=324772; brotli=87679"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105312,
            "unit": "bytes",
            "extra": "raw=335455; brotli=90528"
          },
          {
            "name": "solid-start.minimal",
            "value": 50738,
            "unit": "bytes",
            "extra": "raw=156441; brotli=44725"
          },
          {
            "name": "solid-start.full",
            "value": 56661,
            "unit": "bytes",
            "extra": "raw=173755; brotli=49882"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c992495bf4010ff4c3597bb1f3b1ba02594e857e",
          "message": "feat: match params (#7263)",
          "timestamp": "2026-04-30T19:47:07+02:00",
          "tree_id": "262f4bcbe6894686f505c9c998b26ef040f2e080",
          "url": "https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e"
        },
        "date": 1777571407300,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "dor3382@gmail.com",
            "name": "Dor Alagem",
            "username": "DORI2001"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "761fcc0c96dd96721b533a1fd9e2c972f222ef94",
          "message": "fix(start-plugin-core): sort server fn manifest entries for deterministic build output (#7287)\n\nCo-authored-by: Dor Alagem <doralagem@MacBook-Pro-sl-Dor.local>\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>\nCo-authored-by: Manuel Schiller <meisterpink@gmail.com>",
          "timestamp": "2026-04-30T21:46:30+02:00",
          "tree_id": "3fa7f67e0260ba269366ced99b41c08411a89361",
          "url": "https://github.com/TanStack/router/commit/761fcc0c96dd96721b533a1fd9e2c972f222ef94"
        },
        "date": 1777578538916,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c4256c2c857f392d2031cf87821e4c36a92d0382",
          "message": "fix: Ignore fully type-only imports and re-exports when collecting im… (#7305)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-30T22:37:53+02:00",
          "tree_id": "4b9983be196eafa7dac329aa92d2ef0bfcc1c76e",
          "url": "https://github.com/TanStack/router/commit/c4256c2c857f392d2031cf87821e4c36a92d0382"
        },
        "date": 1777581624781,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "82b06132af776f74603ab27977cc277d6219a845",
          "message": "feat: `strict: false` for server functions (#7277)\n\n* feat: `strict: false` for server functions\n\nAdd a `strict` option to `createServerFn` for type-level server function serialization checks\n\n* feat: `strict: false` for server functions [Self-Healing CI Rerun]\n\n---------\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-04-30T23:52:08+02:00",
          "tree_id": "449eb8993b4544cdd62214ff5bf8cd97465bd39b",
          "url": "https://github.com/TanStack/router/commit/82b06132af776f74603ab27977cc277d6219a845"
        },
        "date": 1777586076556,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4a1e63f1d1230b1ed8234609acad4639d8982c13",
          "message": "fix: parse params union inference (#7306)",
          "timestamp": "2026-05-01T02:04:12+02:00",
          "tree_id": "09dc634807643f0dbdc88d436c54fd4007979fd1",
          "url": "https://github.com/TanStack/router/commit/4a1e63f1d1230b1ed8234609acad4639d8982c13"
        },
        "date": 1777594007904,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ae453b78624cac1b574f0d1efbfbf6ca03922c6c",
          "message": "feat: rsc css (#7310)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-01T14:49:25+02:00",
          "tree_id": "e841827030debad01078ba784414bab4ac3e7997",
          "url": "https://github.com/TanStack/router/commit/ae453b78624cac1b574f0d1efbfbf6ca03922c6c"
        },
        "date": 1777639925770,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "96818b8ba5ead6f1f027094841330182aff415b2",
          "message": "fix(router-plugin): isolate route metadata per plugin instance (#7313)",
          "timestamp": "2026-05-01T21:03:21+02:00",
          "tree_id": "55082a85633c8dfd735323c05c7b5b97794fe317",
          "url": "https://github.com/TanStack/router/commit/96818b8ba5ead6f1f027094841330182aff415b2"
        },
        "date": 1777662359075,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tomsmithhisler@gmail.com",
            "name": "Tom Smithhisler",
            "username": "tsmithhisler"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "51029a0df9eb1df5514e5ef12a8d9aae8847b8cb",
          "message": "fix(deps): move fetchdts from devDependencies to dependencies (#7317)",
          "timestamp": "2026-05-02T08:10:18+02:00",
          "tree_id": "03917adb4aa58d6bb786e1bc3c23a8fcb484bc73",
          "url": "https://github.com/TanStack/router/commit/51029a0df9eb1df5514e5ef12a8d9aae8847b8cb"
        },
        "date": 1777702357969,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "64079946+dfedoryshchev@users.noreply.github.com",
            "name": "dfedoryshchev",
            "username": "dfedoryshchev"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f08ef9db97792376b21774ecbd576a300879aa63",
          "message": "chore: fix duplicate \"the\" typo across router packages (#7323)",
          "timestamp": "2026-05-02T16:38:17+02:00",
          "tree_id": "116e5d0bbf42e268f4242a6c892cce089470e953",
          "url": "https://github.com/TanStack/router/commit/f08ef9db97792376b21774ecbd576a300879aa63"
        },
        "date": 1777732835682,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "238ea4a4998ab3a7fd528b317e1935766ac65df8",
          "message": "feat: early hints (#7324)",
          "timestamp": "2026-05-02T23:35:52+02:00",
          "tree_id": "4ef66bf5efcf6482b57eb01024cca74829f58cd6",
          "url": "https://github.com/TanStack/router/commit/238ea4a4998ab3a7fd528b317e1935766ac65df8"
        },
        "date": 1777757904023,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "709627f3dbc6d97daa547a1401ef42a53bc4be32",
          "message": "feat: Link header (#7327)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-03T01:25:30+02:00",
          "tree_id": "d4d9cf2c7bb060088b78a89efd3f5bf93c84af83",
          "url": "https://github.com/TanStack/router/commit/709627f3dbc6d97daa547a1401ef42a53bc4be32"
        },
        "date": 1777764497363,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tannerlinsley@gmail.com",
            "name": "Tanner Linsley",
            "username": "tannerlinsley"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "35261948496a4899c1718032b574a9f89374077a",
          "message": "docs(skills): address 8 agent failure modes from user feedback (#7314)\n\n* docs(skills): address 8 agent failure modes from external feedback\n\nAdds new start-core/auth-server-primitives skill (sessions, cookies,\nOAuth+PKCE, password-reset enumeration defense, CSRF, rate limiting,\nsession rotation) and updates 8 existing skills + matching docs to fix\npatterns where agents produce insecure or wrong-framework output.\n\nSkill changes:\n- new: start-core/auth-server-primitives (server half of auth)\n- router-core/auth-and-guards: route guard != RPC guard\n- start-core/server-functions: wrong import path, RPC auth required,\n  Cache-Control public is a cross-tenant leak, wrong-framework patterns\n- start-core/middleware: wrong import path, sendContext shape vs access\n  (3-layer wrong/still-wrong/correct), authMiddleware framing\n- start-core/execution-model: file markers (server-only/client-only),\n  module-level process.env is undefined under Worker SSR\n- start-core/deployment: cloudflare env-at-request-time\n- router-core/ssr: wrong file structures (next.js, react-router-dom)\n- router-core/type-safety: wrong-framework imports + structures\n\nDocs updated to mirror each skill change so source-of-truth and the\nintent-indexed skill stay in sync. New authentication-server-primitives\nguide is the long-form companion to the new skill.\n\nintent validate: 30 skill files pass (was 29).\n\n* ci: apply automated fixes\n\n* docs(skills): address coderabbit review feedback\n\n- Fix internal docs links to use correct relative paths instead of an\n  absolute /start/latest/... URL and missing one ../ segment\n- Remove blank line inside auth-and-guards blockquote (markdownlint MD028)\n- Restore overload pattern in type-safety ValidateNavigateOptions and\n  ValidateRedirectOptions examples; the casts I had introduced stripped\n  generic context and contradicted the skill's own no-cast rule\n- Add db.sessions.revokeAllForUser before create in login rotation\n  snippets so the example matches the prose\n- Soften useServerFn guidance: it's required only when the server\n  function throws redirect/notFound; plain-data calls work directly and\n  via useMutation/useQuery\n\n* ci: apply automated fixes\n\n* docs(skills): compress type-safety to stay under 500-line cap\n\nPrettier's autofix expanded my single-line overload signatures across\nmultiple lines, pushing the file over the 500-line limit. Drop the\nredundant fetchOrRedirect example (same pattern as useDelayedNavigate)\nand describe ValidateRedirectOptions usage in prose instead.\n\n* docs(skills): CSRF origin check should compare full origin, not host alone\n\nComparing only new URL(origin).host against APP_HOST silently accepts a\nmismatched scheme — http://example.com would pass a check meant for\nhttps://example.com. Compare the full origin (scheme + host + port)\nagainst APP_ORIGIN instead. Same fix in skill and docs.\n\n* docs(skills): make useDelayedNavigate callback truly return void\n\nThe callback returned the result of setTimeout (a timer handle), not\nvoid as the public overload's return type implied. Wrap in a block so\nthe example matches the declared return type.\n\nSkipped the related nitpick to add a separate redirect example — the\nexisting prose already describes the same overload pattern, and a\nduplicate example would push the file close to the 500-line cap that\nprettier autofix has been bumping us against.\n\n* docs(skills): fix two real bugs in auth-server-primitives examples\n\n1. Cookie parser truncated values containing '='. Signed cookies, JWTs,\n   and base64-padded values all use '='. Use indexOf to split on the\n   FIRST '=' only.\n\n2. Login example short-circuited verifyPasswordHash on user-not-found,\n   contradicting the prose's \"same time, same error\" claim — the\n   no-user branch returned instantly while wrong-password spent ~100ms\n   hashing, leaking account existence over the wire. Always verify\n   against a hash; use a precomputed DUMMY_PASSWORD_HASH when the user\n   is missing, then combine with the user-exists bit for the final ok.\n\nSame fixes in the SKILL.md and the docs companion.\n\n* docs(skills): address manuel's review on react-specific guides\n\n- middleware.md, server-functions.md: drop cross-framework <framework>\n  placeholders; this is the React-specific guide, just say\n  @tanstack/react-start\n- execution-model.md: drop the same trailing line about solid-start /\n  vue-start paths\n- hosting.md: remove the Cloudflare env-handling subsection — the\n  general per-request rule lives in environment-variables.md and\n  doesn't need to be repeated under a specific host\n- environment-variables.md: mention the cloudflare:workers env binding\n  as the canonical Cloudflare way to read env (including module scope),\n  per Manuel's link to the Cloudflare docs\n- deployment skill: same upgrade — show the cloudflare:workers env\n  pattern alongside the per-request handler approach\n\n* docs(skills): drop redundant server-only marker in session example\n\nThe file already imports from @tanstack/react-start/server, which is\non import protection's default client-deny specifier list. The\nside-effect marker is redundant — drop it. Same fix in skill and docs.\n\n* docs(skills): drop wrong-import-path mistakes — TS already catches them\n\nManuel pointed out that TypeScript catches both common wrong paths:\n'@tanstack/react-router' has no exported member createServerFn /\ncreateMiddleware, and '@tanstack/start' is \"Cannot find module\". Skill\nspace is precious; the items don't earn their slot if tsc handles them.\n\nRemoved:\n- Common Mistake \"Wrong import path\" from server-functions and\n  middleware skills (renumbered the remaining mistakes)\n- The matching top-of-file CRITICAL line in both skills\n- The \"Import path\" callouts in the middleware and server-functions\n  docs\n\n---------\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-02T23:11:30-06:00",
          "tree_id": "47fc6055ac4999fc97fdf7308209bae4f58b4cef",
          "url": "https://github.com/TanStack/router/commit/35261948496a4899c1718032b574a9f89374077a"
        },
        "date": 1777785229907,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "hello@sarahgerrard.me",
            "name": "Sarah Gerrard",
            "username": "LadyBluenotes"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9902eb4c61b079a8da0ec098fae1c474d37c0f27",
          "message": "remove old intent artifacts (#7333)",
          "timestamp": "2026-05-03T18:34:20+02:00",
          "tree_id": "e510b74cb8cbccd65e21506edb1d4d1aa5ee43fb",
          "url": "https://github.com/TanStack/router/commit/9902eb4c61b079a8da0ec098fae1c474d37c0f27"
        },
        "date": 1777826209256,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "zelys@dfkhelper.com",
            "name": "Zelys",
            "username": "Zelys-DFKH"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "afa40ef46c273c53646ba33f607fc618a07ffede",
          "message": "fix(start-server-core): fall back to GET handler for HEAD requests (RFC 9110 §9.3.2) (#7325)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-03T18:54:24+02:00",
          "tree_id": "9efa9031c690da8084a83e78cdb8c8454da583fb",
          "url": "https://github.com/TanStack/router/commit/afa40ef46c273c53646ba33f607fc618a07ffede"
        },
        "date": 1777827400452,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "19f496bf6f3cb88d645a261ba7612f599b2b4650",
          "message": "test: add reproducer for #2514 (#7336)",
          "timestamp": "2026-05-04T00:35:10+02:00",
          "tree_id": "c9c2c07908c446342ab7188af9db50e1634c463c",
          "url": "https://github.com/TanStack/router/commit/19f496bf6f3cb88d645a261ba7612f599b2b4650"
        },
        "date": 1777847953062,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ed3152af205e00d99a262c0e283f7989894219ab",
          "message": "test: reproducer for #2547 (#7337)",
          "timestamp": "2026-05-04T00:42:55+02:00",
          "tree_id": "22dbb90af4d643e594088d770854feaf95c993f3",
          "url": "https://github.com/TanStack/router/commit/ed3152af205e00d99a262c0e283f7989894219ab"
        },
        "date": 1777848310070,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "056337ef02ccbeaf45ec8533a227761be869e8f3",
          "message": "fix: fix plain TypeScript parser handling (#7342)",
          "timestamp": "2026-05-05T01:57:21+02:00",
          "tree_id": "031340c34c8cafae4b2c070e34e0637b263f320d",
          "url": "https://github.com/TanStack/router/commit/056337ef02ccbeaf45ec8533a227761be869e8f3"
        },
        "date": 1777939194338,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fdeb3f3e0ca2b9cca2f5e595eeceea6fc08e4ba1",
          "message": "fix: disable rsbuild server compression (#7348)",
          "timestamp": "2026-05-05T22:11:46+02:00",
          "tree_id": "19feb355c17b9f039693022b32965ddc5cf2078d",
          "url": "https://github.com/TanStack/router/commit/fdeb3f3e0ca2b9cca2f5e595eeceea6fc08e4ba1"
        },
        "date": 1778012118500,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104203,
            "unit": "bytes",
            "extra": "raw=329827; brotli=90077"
          },
          {
            "name": "react-start.full",
            "value": 107712,
            "unit": "bytes",
            "extra": "raw=340406; brotli=93141"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101714,
            "unit": "bytes",
            "extra": "raw=324065; brotli=87508"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105097,
            "unit": "bytes",
            "extra": "raw=334748; brotli=90403"
          },
          {
            "name": "solid-start.minimal",
            "value": 50584,
            "unit": "bytes",
            "extra": "raw=155726; brotli=44648"
          },
          {
            "name": "solid-start.full",
            "value": 56520,
            "unit": "bytes",
            "extra": "raw=173040; brotli=49670"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "35e88f04996d71019a1868b7b06ecb4ddbc9df9e",
          "message": "fix: update deps (#7340)",
          "timestamp": "2026-05-05T22:27:21+02:00",
          "tree_id": "7b72e24583470c09b879d9aa43ec2b855fd12463",
          "url": "https://github.com/TanStack/router/commit/35e88f04996d71019a1868b7b06ecb4ddbc9df9e"
        },
        "date": 1778013109209,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89245,
            "unit": "bytes",
            "extra": "raw=280511; brotli=77521"
          },
          {
            "name": "react-router.full",
            "value": 92857,
            "unit": "bytes",
            "extra": "raw=292296; brotli=80600"
          },
          {
            "name": "solid-router.minimal",
            "value": 36234,
            "unit": "bytes",
            "extra": "raw=108799; brotli=32577"
          },
          {
            "name": "solid-router.full",
            "value": 41065,
            "unit": "bytes",
            "extra": "raw=123353; brotli=36910"
          },
          {
            "name": "vue-router.minimal",
            "value": 54430,
            "unit": "bytes",
            "extra": "raw=155022; brotli=48879"
          },
          {
            "name": "vue-router.full",
            "value": 59678,
            "unit": "bytes",
            "extra": "raw=171585; brotli=53437"
          },
          {
            "name": "react-start.minimal",
            "value": 104280,
            "unit": "bytes",
            "extra": "raw=330116; brotli=90139"
          },
          {
            "name": "react-start.full",
            "value": 107797,
            "unit": "bytes",
            "extra": "raw=340695; brotli=93182"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101812,
            "unit": "bytes",
            "extra": "raw=324359; brotli=87564"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105189,
            "unit": "bytes",
            "extra": "raw=335042; brotli=90434"
          },
          {
            "name": "solid-start.minimal",
            "value": 50670,
            "unit": "bytes",
            "extra": "raw=156015; brotli=44736"
          },
          {
            "name": "solid-start.full",
            "value": 56595,
            "unit": "bytes",
            "extra": "raw=173329; brotli=49770"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5ae2ae5e0f8ce32e02667a482ea9be52a6150240",
          "message": "feat(start): CSRF middleware (#7373)",
          "timestamp": "2026-05-09T18:34:24+02:00",
          "tree_id": "c1d49ed8258c4d93c1f0db91eeaabc7c9c3aa32e",
          "url": "https://github.com/TanStack/router/commit/5ae2ae5e0f8ce32e02667a482ea9be52a6150240"
        },
        "date": 1778344613925,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89384,
            "unit": "bytes",
            "extra": "raw=280646; brotli=77626; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292431; brotli=80708; initial_gzip=92857"
          },
          {
            "name": "solid-router.minimal",
            "value": 36360,
            "unit": "bytes",
            "extra": "raw=108915; brotli=32676; initial_gzip=36234"
          },
          {
            "name": "solid-router.full",
            "value": 41192,
            "unit": "bytes",
            "extra": "raw=123469; brotli=37011; initial_gzip=41065"
          },
          {
            "name": "vue-router.minimal",
            "value": 54561,
            "unit": "bytes",
            "extra": "raw=155146; brotli=48974; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59811,
            "unit": "bytes",
            "extra": "raw=171709; brotli=53556; initial_gzip=59678"
          },
          {
            "name": "react-start.minimal",
            "value": 104421,
            "unit": "bytes",
            "extra": "raw=330251; brotli=90245; initial_gzip=104280"
          },
          {
            "name": "react-start.full",
            "value": 107937,
            "unit": "bytes",
            "extra": "raw=340830; brotli=93289; initial_gzip=107797"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101986,
            "unit": "bytes",
            "extra": "raw=324580; brotli=87705; initial_gzip=101812"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105363,
            "unit": "bytes",
            "extra": "raw=335263; brotli=90575; initial_gzip=105189"
          },
          {
            "name": "solid-start.minimal",
            "value": 50801,
            "unit": "bytes",
            "extra": "raw=156139; brotli=44841; initial_gzip=50670"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173453; brotli=49869; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "34962865+shkumbinhasani@users.noreply.github.com",
            "name": "Shkumbin Hasani",
            "username": "shkumbinhasani"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b1c061aff9185cdf5fdc08c0136382a9dce0302f",
          "message": "fix(router-core): fix missing closing paren in CSS.supports check for view transition types (#7369)",
          "timestamp": "2026-05-10T00:11:51+02:00",
          "tree_id": "29f063571dc7f0efa64cf267fbf3c265cdc10439",
          "url": "https://github.com/TanStack/router/commit/b1c061aff9185cdf5fdc08c0136382a9dce0302f"
        },
        "date": 1778364854732,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101986,
            "unit": "bytes",
            "extra": "raw=324581; brotli=87691; initial_gzip=101812"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105364,
            "unit": "bytes",
            "extra": "raw=335264; brotli=90574; initial_gzip=105190"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "038cd123b70bc6154d75abb6404a744c376f8f6a",
          "message": "fix: fix jiti usage for tsconfig paths (#7382)\n\n* Enable jiti tsconfig path aliases\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/0a481c9b-eb97-4543-acc5-71d43b97d386\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n* Use fixture for jiti tsconfig aliases\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/182b9baa-9e54-4813-a322-c33a1da5417d\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n* Track fixture path alias helper\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/182b9baa-9e54-4813-a322-c33a1da5417d\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n* Add router-generator changeset\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/ab1a42cc-7326-4e36-a656-f01179221cee\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n* Format virtual config fixture\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/22194166-b3a7-431e-b723-ad594d4b0405\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n---------\n\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>",
          "timestamp": "2026-05-11T21:16:18+02:00",
          "tree_id": "faa9bc2b283c1da2369371636588d1662e4728a9",
          "url": "https://github.com/TanStack/router/commit/038cd123b70bc6154d75abb6404a744c376f8f6a"
        },
        "date": 1778527133164,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101986,
            "unit": "bytes",
            "extra": "raw=324581; brotli=87691; initial_gzip=101812"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105364,
            "unit": "bytes",
            "extra": "raw=335264; brotli=90574; initial_gzip=105190"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9f9f371e594000b3fffed4fd5a0ee5db217d3a65",
          "message": "fix: revert plugin changes, createCsrfMiddleware compilation, fix HMR tests (#7400)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>\nCo-authored-by: Manuel Schiller <manuel.schiller@caligano.de>",
          "timestamp": "2026-05-15T16:35:59+02:00",
          "tree_id": "73287505c058168cba529a0efa918d5d5106f117",
          "url": "https://github.com/TanStack/router/commit/9f9f371e594000b3fffed4fd5a0ee5db217d3a65"
        },
        "date": 1778855907423,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101984,
            "unit": "bytes",
            "extra": "raw=324585; brotli=87773; initial_gzip=101808"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105357,
            "unit": "bytes",
            "extra": "raw=335268; brotli=90617; initial_gzip=105181"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ae6483914569e4dd301d50e2691b3d8d98c24978",
          "message": "ci: Version Packages (#7405)\n\nci: changeset release\n\nCo-authored-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-15T21:24:23+02:00",
          "tree_id": "0cd53e222ec2c3974f02e85ea32013efe773bc54",
          "url": "https://github.com/TanStack/router/commit/ae6483914569e4dd301d50e2691b3d8d98c24978"
        },
        "date": 1778873215244,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101984,
            "unit": "bytes",
            "extra": "raw=324585; brotli=87773; initial_gzip=101808"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105357,
            "unit": "bytes",
            "extra": "raw=335268; brotli=90617; initial_gzip=105181"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2387a2eea0683004cc400b9f71bed5944eb60110",
          "message": "feat(start): add inline CSS runtime controls and asset URL templates (#7380)",
          "timestamp": "2026-05-16T00:38:42+02:00",
          "tree_id": "88d43e4994f6046a4f932bcf247172915805944d",
          "url": "https://github.com/TanStack/router/commit/2387a2eea0683004cc400b9f71bed5944eb60110"
        },
        "date": 1778884870645,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101984,
            "unit": "bytes",
            "extra": "raw=324585; brotli=87773; initial_gzip=101808"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105357,
            "unit": "bytes",
            "extra": "raw=335268; brotli=90617; initial_gzip=105181"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "13432ad9ff9f5f8d438de6d5ab30223b401b917b",
          "message": "ci: Version Packages (#7407)",
          "timestamp": "2026-05-16T00:55:45+02:00",
          "tree_id": "a51ed45ee5980f6f3fefacddc60c1fd2003941fa",
          "url": "https://github.com/TanStack/router/commit/13432ad9ff9f5f8d438de6d5ab30223b401b917b"
        },
        "date": 1778885894695,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101984,
            "unit": "bytes",
            "extra": "raw=324585; brotli=87773; initial_gzip=101808"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105357,
            "unit": "bytes",
            "extra": "raw=335268; brotli=90617; initial_gzip=105181"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "742941e2f1bf069c950d0a4985b2cd733639509e",
          "message": "fix: Fix literal underscore paths under pathless layouts (#7408)",
          "timestamp": "2026-05-16T04:08:22+02:00",
          "tree_id": "30766c7bd7812482da384f08b37fe8af7e3c724a",
          "url": "https://github.com/TanStack/router/commit/742941e2f1bf069c950d0a4985b2cd733639509e"
        },
        "date": 1778897454664,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101984,
            "unit": "bytes",
            "extra": "raw=324585; brotli=87773; initial_gzip=101808"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105357,
            "unit": "bytes",
            "extra": "raw=335268; brotli=90617; initial_gzip=105181"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b3f2ab809e0fee12cd2a015a5256b8c451736d34",
          "message": "ci: Version Packages (#7409)\n\nci: changeset release\n\nCo-authored-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-16T07:02:58+02:00",
          "tree_id": "78da35d32e21707eae241761c6bf5b651fb4cf92",
          "url": "https://github.com/TanStack/router/commit/b3f2ab809e0fee12cd2a015a5256b8c451736d34"
        },
        "date": 1778907924278,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89386,
            "unit": "bytes",
            "extra": "raw=280647; brotli=77673; initial_gzip=89245"
          },
          {
            "name": "react-router.full",
            "value": 92998,
            "unit": "bytes",
            "extra": "raw=292432; brotli=80788; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36363,
            "unit": "bytes",
            "extra": "raw=108916; brotli=32742; initial_gzip=36236"
          },
          {
            "name": "solid-router.full",
            "value": 41194,
            "unit": "bytes",
            "extra": "raw=123470; brotli=37009; initial_gzip=41066"
          },
          {
            "name": "vue-router.minimal",
            "value": 54564,
            "unit": "bytes",
            "extra": "raw=155147; brotli=48995; initial_gzip=54430"
          },
          {
            "name": "vue-router.full",
            "value": 59813,
            "unit": "bytes",
            "extra": "raw=171710; brotli=53646; initial_gzip=59680"
          },
          {
            "name": "react-start.minimal",
            "value": 104419,
            "unit": "bytes",
            "extra": "raw=330252; brotli=90283; initial_gzip=104279"
          },
          {
            "name": "react-start.full",
            "value": 107939,
            "unit": "bytes",
            "extra": "raw=340831; brotli=93378; initial_gzip=107799"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101984,
            "unit": "bytes",
            "extra": "raw=324585; brotli=87773; initial_gzip=101808"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105357,
            "unit": "bytes",
            "extra": "raw=335268; brotli=90617; initial_gzip=105181"
          },
          {
            "name": "solid-start.minimal",
            "value": 50803,
            "unit": "bytes",
            "extra": "raw=156140; brotli=44835; initial_gzip=50671"
          },
          {
            "name": "solid-start.full",
            "value": 56728,
            "unit": "bytes",
            "extra": "raw=173454; brotli=49889; initial_gzip=56595"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d533f87976704098a40b48f160b37c28c8182806",
          "message": "feat(router-core): params.priority route option as tie breaker in matching algorithm (#7411)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-16T16:20:12+02:00",
          "tree_id": "19b9088d14b7a144821a958e20fa333da182db87",
          "url": "https://github.com/TanStack/router/commit/d533f87976704098a40b48f160b37c28c8182806"
        },
        "date": 1778941366123,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104457,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90419; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107974,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93309; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102024,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87689; initial_gzip=101848"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105400,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90609; initial_gzip=105224"
          },
          {
            "name": "solid-start.minimal",
            "value": 50849,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44862; initial_gzip=50714"
          },
          {
            "name": "solid-start.full",
            "value": 56766,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49942; initial_gzip=56633"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4e42422f2824c16dbd3bea37021ba89534bb1a9b",
          "message": "ci: Version Packages (#7413)",
          "timestamp": "2026-05-16T16:32:00+02:00",
          "tree_id": "096c92af13609166dc9f20ad05de2691fcd16ab7",
          "url": "https://github.com/TanStack/router/commit/4e42422f2824c16dbd3bea37021ba89534bb1a9b"
        },
        "date": 1778942078325,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104457,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90419; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107974,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93309; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102024,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87689; initial_gzip=101848"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105400,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90609; initial_gzip=105224"
          },
          {
            "name": "solid-start.minimal",
            "value": 50849,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44862; initial_gzip=50714"
          },
          {
            "name": "solid-start.full",
            "value": 56766,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49942; initial_gzip=56633"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d9cf9331b83fcbd2abfee75d839d862f9bb18e6b",
          "message": "fix(router-core): hydrate before initial client route match (#7416)",
          "timestamp": "2026-05-16T21:10:08+02:00",
          "tree_id": "88a7ffd121664071154334bbd5485d581a793616",
          "url": "https://github.com/TanStack/router/commit/d9cf9331b83fcbd2abfee75d839d862f9bb18e6b"
        },
        "date": 1778958742900,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104458,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90236; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107971,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93354; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50850,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44849; initial_gzip=50716"
          },
          {
            "name": "solid-start.full",
            "value": 56768,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49886; initial_gzip=56634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d1dc4ae7c06db0b9035850968f791f1e403c43f2",
          "message": "ci: Version Packages (#7417)",
          "timestamp": "2026-05-16T21:17:56+02:00",
          "tree_id": "c47aa00fc8b3f850caf59e7cf9a3348acd62642d",
          "url": "https://github.com/TanStack/router/commit/d1dc4ae7c06db0b9035850968f791f1e403c43f2"
        },
        "date": 1778959215597,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104458,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90236; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107971,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93354; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50850,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44849; initial_gzip=50716"
          },
          {
            "name": "solid-start.full",
            "value": 56768,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49886; initial_gzip=56634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8146db7e54f5d508f1fb7d3927edd0a2f71dc930",
          "message": "fix(router-plugin): detect typed root route context for HMR (#7420)",
          "timestamp": "2026-05-17T00:42:32+02:00",
          "tree_id": "29f3c518b91f80da68ec3173c02a8a3526a6cf30",
          "url": "https://github.com/TanStack/router/commit/8146db7e54f5d508f1fb7d3927edd0a2f71dc930"
        },
        "date": 1778971493225,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104458,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90236; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107971,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93354; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50850,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44849; initial_gzip=50716"
          },
          {
            "name": "solid-start.full",
            "value": 56768,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49886; initial_gzip=56634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "32c5a8ec8d19afd34badb1cb0e42985b728be5b4",
          "message": "ci: Version Packages (#7421)",
          "timestamp": "2026-05-17T00:54:12+02:00",
          "tree_id": "e2318a2e153849cc0e2bc0dfa04557ac9a24894c",
          "url": "https://github.com/TanStack/router/commit/32c5a8ec8d19afd34badb1cb0e42985b728be5b4"
        },
        "date": 1778972206441,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104458,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90236; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107971,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93354; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50850,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44849; initial_gzip=50716"
          },
          {
            "name": "solid-start.full",
            "value": 56768,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49886; initial_gzip=56634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b60eb36e59e8a468ee0742cbcf7f47aca1ff1c67",
          "message": "fix: fix route mismatch warnings and HMR route indexes (#7422)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-17T13:35:04+02:00",
          "tree_id": "92da92582a8680b2e697b0984c8399471673e43b",
          "url": "https://github.com/TanStack/router/commit/b60eb36e59e8a468ee0742cbcf7f47aca1ff1c67"
        },
        "date": 1779017837920,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104458,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90236; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107971,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93354; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50850,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44849; initial_gzip=50716"
          },
          {
            "name": "solid-start.full",
            "value": 56768,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49886; initial_gzip=56634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ee8a6753da78590e3f8659db6d96403604394f34",
          "message": "ci: Version Packages (#7423)",
          "timestamp": "2026-05-17T13:43:38+02:00",
          "tree_id": "5e43c164432270c49f8e618cb5f0b41cd7123f7f",
          "url": "https://github.com/TanStack/router/commit/ee8a6753da78590e3f8659db6d96403604394f34"
        },
        "date": 1779018362264,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36404,
            "unit": "bytes",
            "extra": "raw=109055; brotli=32776; initial_gzip=36277"
          },
          {
            "name": "solid-router.full",
            "value": 41232,
            "unit": "bytes",
            "extra": "raw=123609; brotli=37053; initial_gzip=41104"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104458,
            "unit": "bytes",
            "extra": "raw=330391; brotli=90236; initial_gzip=104316"
          },
          {
            "name": "react-start.full",
            "value": 107971,
            "unit": "bytes",
            "extra": "raw=340970; brotli=93354; initial_gzip=107832"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50850,
            "unit": "bytes",
            "extra": "raw=156279; brotli=44849; initial_gzip=50716"
          },
          {
            "name": "solid-start.full",
            "value": 56768,
            "unit": "bytes",
            "extra": "raw=173593; brotli=49886; initial_gzip=56634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5fa9e555f3a2edb5e45586623e6bcbfa7f7c7a6b",
          "message": "feat: deferred hydration (#7362)\n\n* feat: deferred hydration\n\n* fix\n\n* tests\n\n* solid tests\n\n* Changes before error encountered\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/5263c469-75c2-4470-bd4c-86f9b43964f4\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n* chore: address hydration review follow-ups\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/16e27113-ff01-4de8-aded-b9be9f6dd4ff\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n* fix(start-client-core): correct import order in hydrateStart.ts\n\nCo-authored-by: schiller-manuel <schiller-manuel@users.noreply.github.com>\n\n* chore: remove tracked nx self-healing artifacts\n\nAgent-Logs-Url: https://github.com/TanStack/router/sessions/95750760-1348-437c-8f73-cc45e899003a\n\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\n\n---------\n\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>\nCo-authored-by: schiller-manuel <6340397+schiller-manuel@users.noreply.github.com>\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>\nCo-authored-by: schiller-manuel <schiller-manuel@users.noreply.github.com>",
          "timestamp": "2026-05-19T18:43:00+02:00",
          "tree_id": "3d4fb9690db613d48e92f31bcef9e9da79e91e7b",
          "url": "https://github.com/TanStack/router/commit/5fa9e555f3a2edb5e45586623e6bcbfa7f7c7a6b"
        },
        "date": 1779209129734,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36419,
            "unit": "bytes",
            "extra": "raw=109071; brotli=32756; initial_gzip=36291"
          },
          {
            "name": "solid-router.full",
            "value": 41233,
            "unit": "bytes",
            "extra": "raw=123625; brotli=37046; initial_gzip=41105"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104465,
            "unit": "bytes",
            "extra": "raw=330401; brotli=90254; initial_gzip=104324"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105551,
            "unit": "bytes",
            "extra": "raw=332083; brotli=91387; initial_gzip=104654"
          },
          {
            "name": "react-start.full",
            "value": 107980,
            "unit": "bytes",
            "extra": "raw=340980; brotli=93292; initial_gzip=107838"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50880,
            "unit": "bytes",
            "extra": "raw=156305; brotli=44871; initial_gzip=50746"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55094,
            "unit": "bytes",
            "extra": "raw=165051; brotli=48880; initial_gzip=51665"
          },
          {
            "name": "solid-start.full",
            "value": 56791,
            "unit": "bytes",
            "extra": "raw=173619; brotli=49989; initial_gzip=56656"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fpellet@ensc.fr",
            "name": "Flo",
            "username": "Sheraff"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9f6258f23ee37a35fb908b3293e49bab3058e57f",
          "message": "chore: update zod to v4.4.3 (#7441)\n\n* chore: update zod to v4.4.3\n\n* fix(start): preserve route path defaults\n\n* fix(examples): resolve zod 4 build failures",
          "timestamp": "2026-05-20T08:41:45+02:00",
          "tree_id": "d42f2605ab4f0614e65e2605ccde3f376322eed4",
          "url": "https://github.com/TanStack/router/commit/9f6258f23ee37a35fb908b3293e49bab3058e57f"
        },
        "date": 1779259491078,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36419,
            "unit": "bytes",
            "extra": "raw=109071; brotli=32756; initial_gzip=36291"
          },
          {
            "name": "solid-router.full",
            "value": 41233,
            "unit": "bytes",
            "extra": "raw=123625; brotli=37046; initial_gzip=41105"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104465,
            "unit": "bytes",
            "extra": "raw=330401; brotli=90254; initial_gzip=104324"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105551,
            "unit": "bytes",
            "extra": "raw=332083; brotli=91387; initial_gzip=104654"
          },
          {
            "name": "react-start.full",
            "value": 107980,
            "unit": "bytes",
            "extra": "raw=340980; brotli=93292; initial_gzip=107838"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50880,
            "unit": "bytes",
            "extra": "raw=156305; brotli=44871; initial_gzip=50746"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55094,
            "unit": "bytes",
            "extra": "raw=165051; brotli=48880; initial_gzip=51665"
          },
          {
            "name": "solid-start.full",
            "value": 56791,
            "unit": "bytes",
            "extra": "raw=173619; brotli=49989; initial_gzip=56656"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "254cb8834ed11244bbf17c2801f630b5a438c040",
          "message": "ci: Version Packages (#7435)\n\nci: changeset release\n\nCo-authored-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-20T12:00:06+02:00",
          "tree_id": "bc782d3fcac200468b596d185a4e11a781e70b03",
          "url": "https://github.com/TanStack/router/commit/254cb8834ed11244bbf17c2801f630b5a438c040"
        },
        "date": 1779271367392,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89421,
            "unit": "bytes",
            "extra": "raw=280786; brotli=77765; initial_gzip=89281"
          },
          {
            "name": "react-router.full",
            "value": 93034,
            "unit": "bytes",
            "extra": "raw=292571; brotli=80812; initial_gzip=92894"
          },
          {
            "name": "solid-router.minimal",
            "value": 36419,
            "unit": "bytes",
            "extra": "raw=109071; brotli=32756; initial_gzip=36291"
          },
          {
            "name": "solid-router.full",
            "value": 41233,
            "unit": "bytes",
            "extra": "raw=123625; brotli=37046; initial_gzip=41105"
          },
          {
            "name": "vue-router.minimal",
            "value": 54605,
            "unit": "bytes",
            "extra": "raw=155286; brotli=49043; initial_gzip=54470"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171849; brotli=53669; initial_gzip=59718"
          },
          {
            "name": "react-start.minimal",
            "value": 104465,
            "unit": "bytes",
            "extra": "raw=330401; brotli=90254; initial_gzip=104324"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105551,
            "unit": "bytes",
            "extra": "raw=332083; brotli=91387; initial_gzip=104654"
          },
          {
            "name": "react-start.full",
            "value": 107980,
            "unit": "bytes",
            "extra": "raw=340980; brotli=93292; initial_gzip=107838"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102026,
            "unit": "bytes",
            "extra": "raw=324724; brotli=87704; initial_gzip=101850"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105402,
            "unit": "bytes",
            "extra": "raw=335407; brotli=90597; initial_gzip=105226"
          },
          {
            "name": "solid-start.minimal",
            "value": 50880,
            "unit": "bytes",
            "extra": "raw=156305; brotli=44871; initial_gzip=50746"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55094,
            "unit": "bytes",
            "extra": "raw=165051; brotli=48880; initial_gzip=51665"
          },
          {
            "name": "solid-start.full",
            "value": 56791,
            "unit": "bytes",
            "extra": "raw=173619; brotli=49989; initial_gzip=56656"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d024a5487bc28418c0589f163fbc56eb8d633753",
          "message": "perf: optimize and test rewrite (#7448)\n\noptimize and test rewrite",
          "timestamp": "2026-05-20T22:54:58+02:00",
          "tree_id": "23ccdf868bb3577dd14a9928a61b7c0c6eb3ad2c",
          "url": "https://github.com/TanStack/router/commit/d024a5487bc28418c0589f163fbc56eb8d633753"
        },
        "date": 1779310656957,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89419,
            "unit": "bytes",
            "extra": "raw=280750; brotli=77727; initial_gzip=89278"
          },
          {
            "name": "react-router.full",
            "value": 93044,
            "unit": "bytes",
            "extra": "raw=292535; brotli=80834; initial_gzip=92903"
          },
          {
            "name": "solid-router.minimal",
            "value": 36417,
            "unit": "bytes",
            "extra": "raw=109035; brotli=32701; initial_gzip=36291"
          },
          {
            "name": "solid-router.full",
            "value": 41235,
            "unit": "bytes",
            "extra": "raw=123589; brotli=37056; initial_gzip=41108"
          },
          {
            "name": "vue-router.minimal",
            "value": 54595,
            "unit": "bytes",
            "extra": "raw=155250; brotli=49057; initial_gzip=54464"
          },
          {
            "name": "vue-router.full",
            "value": 59847,
            "unit": "bytes",
            "extra": "raw=171813; brotli=53617; initial_gzip=59714"
          },
          {
            "name": "react-start.minimal",
            "value": 104463,
            "unit": "bytes",
            "extra": "raw=330365; brotli=90267; initial_gzip=104322"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105551,
            "unit": "bytes",
            "extra": "raw=332047; brotli=91343; initial_gzip=104653"
          },
          {
            "name": "react-start.full",
            "value": 107979,
            "unit": "bytes",
            "extra": "raw=340944; brotli=93302; initial_gzip=107837"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102020,
            "unit": "bytes",
            "extra": "raw=324686; brotli=87637; initial_gzip=101844"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105398,
            "unit": "bytes",
            "extra": "raw=335369; brotli=90623; initial_gzip=105222"
          },
          {
            "name": "solid-start.minimal",
            "value": 50877,
            "unit": "bytes",
            "extra": "raw=156269; brotli=44925; initial_gzip=50745"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55087,
            "unit": "bytes",
            "extra": "raw=165015; brotli=48857; initial_gzip=51662"
          },
          {
            "name": "solid-start.full",
            "value": 56784,
            "unit": "bytes",
            "extra": "raw=173583; brotli=49918; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0300f87ec5a7f878ffbe0b181acf84cba9139960",
          "message": "fix: fix scroll restoration issues (#7447)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>",
          "timestamp": "2026-05-20T23:12:12+02:00",
          "tree_id": "998e0d2035413107aee77650ca8d7627456f0b68",
          "url": "https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960"
        },
        "date": 1779311690352,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89392,
            "unit": "bytes",
            "extra": "raw=280592; brotli=77753; initial_gzip=89251"
          },
          {
            "name": "react-router.full",
            "value": 93000,
            "unit": "bytes",
            "extra": "raw=292362; brotli=80787; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=108877; brotli=32748; initial_gzip=36255"
          },
          {
            "name": "solid-router.full",
            "value": 41237,
            "unit": "bytes",
            "extra": "raw=123417; brotli=37095; initial_gzip=41112"
          },
          {
            "name": "vue-router.minimal",
            "value": 54602,
            "unit": "bytes",
            "extra": "raw=155092; brotli=49073; initial_gzip=54472"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171641; brotli=53624; initial_gzip=59717"
          },
          {
            "name": "react-start.minimal",
            "value": 104471,
            "unit": "bytes",
            "extra": "raw=330207; brotli=90378; initial_gzip=104331"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105545,
            "unit": "bytes",
            "extra": "raw=331889; brotli=91398; initial_gzip=104647"
          },
          {
            "name": "react-start.full",
            "value": 107950,
            "unit": "bytes",
            "extra": "raw=340769; brotli=93220; initial_gzip=107811"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102028,
            "unit": "bytes",
            "extra": "raw=324532; brotli=87842; initial_gzip=101852"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105399,
            "unit": "bytes",
            "extra": "raw=335193; brotli=90648; initial_gzip=105223"
          },
          {
            "name": "solid-start.minimal",
            "value": 50864,
            "unit": "bytes",
            "extra": "raw=156111; brotli=44882; initial_gzip=50729"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55032,
            "unit": "bytes",
            "extra": "raw=164852; brotli=48898; initial_gzip=51606"
          },
          {
            "name": "solid-start.full",
            "value": 56786,
            "unit": "bytes",
            "extra": "raw=173407; brotli=49999; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "35a7d9cd5a0e6e19a6ad6f5b79b89b4f069a17bc",
          "message": "ci: Version Packages (#7452)",
          "timestamp": "2026-05-20T23:32:04+02:00",
          "tree_id": "ea6477b9210d06575857ebbf2036b30a5b639fe5",
          "url": "https://github.com/TanStack/router/commit/35a7d9cd5a0e6e19a6ad6f5b79b89b4f069a17bc"
        },
        "date": 1779312885418,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89392,
            "unit": "bytes",
            "extra": "raw=280592; brotli=77753; initial_gzip=89251"
          },
          {
            "name": "react-router.full",
            "value": 93000,
            "unit": "bytes",
            "extra": "raw=292362; brotli=80787; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=108877; brotli=32748; initial_gzip=36255"
          },
          {
            "name": "solid-router.full",
            "value": 41237,
            "unit": "bytes",
            "extra": "raw=123417; brotli=37095; initial_gzip=41112"
          },
          {
            "name": "vue-router.minimal",
            "value": 54602,
            "unit": "bytes",
            "extra": "raw=155092; brotli=49073; initial_gzip=54472"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171641; brotli=53624; initial_gzip=59717"
          },
          {
            "name": "react-start.minimal",
            "value": 104471,
            "unit": "bytes",
            "extra": "raw=330207; brotli=90378; initial_gzip=104331"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105545,
            "unit": "bytes",
            "extra": "raw=331889; brotli=91398; initial_gzip=104647"
          },
          {
            "name": "react-start.full",
            "value": 107950,
            "unit": "bytes",
            "extra": "raw=340769; brotli=93220; initial_gzip=107811"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102028,
            "unit": "bytes",
            "extra": "raw=324532; brotli=87842; initial_gzip=101852"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105399,
            "unit": "bytes",
            "extra": "raw=335193; brotli=90648; initial_gzip=105223"
          },
          {
            "name": "solid-start.minimal",
            "value": 50864,
            "unit": "bytes",
            "extra": "raw=156111; brotli=44882; initial_gzip=50729"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55032,
            "unit": "bytes",
            "extra": "raw=164852; brotli=48898; initial_gzip=51606"
          },
          {
            "name": "solid-start.full",
            "value": 56786,
            "unit": "bytes",
            "extra": "raw=173407; brotli=49999; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7df0d02bfb1407b1f07731ef69af24e2f0e415d7",
          "message": "fix: Fix escaped underscore index route generation (#7453)",
          "timestamp": "2026-05-21T00:03:43+02:00",
          "tree_id": "e8c7977ea11f175f22a7700a3cfbde1f9de094f8",
          "url": "https://github.com/TanStack/router/commit/7df0d02bfb1407b1f07731ef69af24e2f0e415d7"
        },
        "date": 1779314780460,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89392,
            "unit": "bytes",
            "extra": "raw=280592; brotli=77753; initial_gzip=89251"
          },
          {
            "name": "react-router.full",
            "value": 93000,
            "unit": "bytes",
            "extra": "raw=292362; brotli=80787; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=108877; brotli=32748; initial_gzip=36255"
          },
          {
            "name": "solid-router.full",
            "value": 41237,
            "unit": "bytes",
            "extra": "raw=123417; brotli=37095; initial_gzip=41112"
          },
          {
            "name": "vue-router.minimal",
            "value": 54602,
            "unit": "bytes",
            "extra": "raw=155092; brotli=49073; initial_gzip=54472"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171641; brotli=53624; initial_gzip=59717"
          },
          {
            "name": "react-start.minimal",
            "value": 104471,
            "unit": "bytes",
            "extra": "raw=330207; brotli=90378; initial_gzip=104331"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105545,
            "unit": "bytes",
            "extra": "raw=331889; brotli=91398; initial_gzip=104647"
          },
          {
            "name": "react-start.full",
            "value": 107950,
            "unit": "bytes",
            "extra": "raw=340769; brotli=93220; initial_gzip=107811"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102028,
            "unit": "bytes",
            "extra": "raw=324532; brotli=87842; initial_gzip=101852"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105399,
            "unit": "bytes",
            "extra": "raw=335193; brotli=90648; initial_gzip=105223"
          },
          {
            "name": "solid-start.minimal",
            "value": 50864,
            "unit": "bytes",
            "extra": "raw=156111; brotli=44882; initial_gzip=50729"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55032,
            "unit": "bytes",
            "extra": "raw=164852; brotli=48898; initial_gzip=51606"
          },
          {
            "name": "solid-start.full",
            "value": 56786,
            "unit": "bytes",
            "extra": "raw=173407; brotli=49999; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "65b4abe65bc222e4244585fa8d85a6144448e99a",
          "message": "ci: Version Packages (#7454)",
          "timestamp": "2026-05-21T00:28:19+02:00",
          "tree_id": "eba6ae49e8acedf546023c5071f72ec55f7b1211",
          "url": "https://github.com/TanStack/router/commit/65b4abe65bc222e4244585fa8d85a6144448e99a"
        },
        "date": 1779316242058,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89392,
            "unit": "bytes",
            "extra": "raw=280592; brotli=77753; initial_gzip=89251"
          },
          {
            "name": "react-router.full",
            "value": 93000,
            "unit": "bytes",
            "extra": "raw=292362; brotli=80787; initial_gzip=92858"
          },
          {
            "name": "solid-router.minimal",
            "value": 36382,
            "unit": "bytes",
            "extra": "raw=108877; brotli=32748; initial_gzip=36255"
          },
          {
            "name": "solid-router.full",
            "value": 41237,
            "unit": "bytes",
            "extra": "raw=123417; brotli=37095; initial_gzip=41112"
          },
          {
            "name": "vue-router.minimal",
            "value": 54602,
            "unit": "bytes",
            "extra": "raw=155092; brotli=49073; initial_gzip=54472"
          },
          {
            "name": "vue-router.full",
            "value": 59850,
            "unit": "bytes",
            "extra": "raw=171641; brotli=53624; initial_gzip=59717"
          },
          {
            "name": "react-start.minimal",
            "value": 104471,
            "unit": "bytes",
            "extra": "raw=330207; brotli=90378; initial_gzip=104331"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105545,
            "unit": "bytes",
            "extra": "raw=331889; brotli=91398; initial_gzip=104647"
          },
          {
            "name": "react-start.full",
            "value": 107950,
            "unit": "bytes",
            "extra": "raw=340769; brotli=93220; initial_gzip=107811"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102028,
            "unit": "bytes",
            "extra": "raw=324532; brotli=87842; initial_gzip=101852"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105399,
            "unit": "bytes",
            "extra": "raw=335193; brotli=90648; initial_gzip=105223"
          },
          {
            "name": "solid-start.minimal",
            "value": 50864,
            "unit": "bytes",
            "extra": "raw=156111; brotli=44882; initial_gzip=50729"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55032,
            "unit": "bytes",
            "extra": "raw=164852; brotli=48898; initial_gzip=51606"
          },
          {
            "name": "solid-start.full",
            "value": 56786,
            "unit": "bytes",
            "extra": "raw=173407; brotli=49999; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5268ba4566233ea58880df85f167ad0401a93a46",
          "message": "fix: Fix hash scrolling with `resetScroll={false}` (#7464)\n\nCo-authored-by: coderabbitai[bot] <136622811+coderabbitai[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-21T22:54:26+02:00",
          "tree_id": "a3d2ab639dff701edd83c6b8ca87c751d5522d51",
          "url": "https://github.com/TanStack/router/commit/5268ba4566233ea58880df85f167ad0401a93a46"
        },
        "date": 1779397068202,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89390,
            "unit": "bytes",
            "extra": "raw=280599; brotli=77755; initial_gzip=89250"
          },
          {
            "name": "react-router.full",
            "value": 93003,
            "unit": "bytes",
            "extra": "raw=292369; brotli=80643; initial_gzip=92863"
          },
          {
            "name": "solid-router.minimal",
            "value": 36384,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32720; initial_gzip=36256"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=123424; brotli=37068; initial_gzip=41115"
          },
          {
            "name": "vue-router.minimal",
            "value": 54606,
            "unit": "bytes",
            "extra": "raw=155099; brotli=49030; initial_gzip=54474"
          },
          {
            "name": "vue-router.full",
            "value": 59851,
            "unit": "bytes",
            "extra": "raw=171648; brotli=53610; initial_gzip=59719"
          },
          {
            "name": "react-start.minimal",
            "value": 104475,
            "unit": "bytes",
            "extra": "raw=330214; brotli=90410; initial_gzip=104333"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105546,
            "unit": "bytes",
            "extra": "raw=331896; brotli=91349; initial_gzip=104648"
          },
          {
            "name": "react-start.full",
            "value": 107958,
            "unit": "bytes",
            "extra": "raw=340776; brotli=93358; initial_gzip=107816"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102028,
            "unit": "bytes",
            "extra": "raw=324537; brotli=87785; initial_gzip=101852"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105403,
            "unit": "bytes",
            "extra": "raw=335198; brotli=90712; initial_gzip=105227"
          },
          {
            "name": "solid-start.minimal",
            "value": 50862,
            "unit": "bytes",
            "extra": "raw=156118; brotli=44926; initial_gzip=50729"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55033,
            "unit": "bytes",
            "extra": "raw=164859; brotli=48883; initial_gzip=51608"
          },
          {
            "name": "solid-start.full",
            "value": 56787,
            "unit": "bytes",
            "extra": "raw=173414; brotli=49971; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b47b338d15deadb8dc9fbc297c39965442833c3a",
          "message": "ci: Version Packages (#7467)",
          "timestamp": "2026-05-21T23:05:25+02:00",
          "tree_id": "caf4a2694359d377804d8d83eeaee26861703ab6",
          "url": "https://github.com/TanStack/router/commit/b47b338d15deadb8dc9fbc297c39965442833c3a"
        },
        "date": 1779397674185,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89390,
            "unit": "bytes",
            "extra": "raw=280599; brotli=77755; initial_gzip=89250"
          },
          {
            "name": "react-router.full",
            "value": 93003,
            "unit": "bytes",
            "extra": "raw=292369; brotli=80643; initial_gzip=92863"
          },
          {
            "name": "solid-router.minimal",
            "value": 36384,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32720; initial_gzip=36256"
          },
          {
            "name": "solid-router.full",
            "value": 41243,
            "unit": "bytes",
            "extra": "raw=123424; brotli=37068; initial_gzip=41115"
          },
          {
            "name": "vue-router.minimal",
            "value": 54606,
            "unit": "bytes",
            "extra": "raw=155099; brotli=49030; initial_gzip=54474"
          },
          {
            "name": "vue-router.full",
            "value": 59851,
            "unit": "bytes",
            "extra": "raw=171648; brotli=53610; initial_gzip=59719"
          },
          {
            "name": "react-start.minimal",
            "value": 104475,
            "unit": "bytes",
            "extra": "raw=330214; brotli=90410; initial_gzip=104333"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105546,
            "unit": "bytes",
            "extra": "raw=331896; brotli=91349; initial_gzip=104648"
          },
          {
            "name": "react-start.full",
            "value": 107958,
            "unit": "bytes",
            "extra": "raw=340776; brotli=93358; initial_gzip=107816"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 102028,
            "unit": "bytes",
            "extra": "raw=324537; brotli=87785; initial_gzip=101852"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105403,
            "unit": "bytes",
            "extra": "raw=335198; brotli=90712; initial_gzip=105227"
          },
          {
            "name": "solid-start.minimal",
            "value": 50862,
            "unit": "bytes",
            "extra": "raw=156118; brotli=44926; initial_gzip=50729"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 55033,
            "unit": "bytes",
            "extra": "raw=164859; brotli=48883; initial_gzip=51608"
          },
          {
            "name": "solid-start.full",
            "value": 56787,
            "unit": "bytes",
            "extra": "raw=173414; brotli=49971; initial_gzip=56653"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "51a97a167fb3ef1b8ca70fbb63db635158f43509",
          "message": "feat(start): support rsbuild iife client output (#7477)",
          "timestamp": "2026-05-24T02:02:05+02:00",
          "tree_id": "b0133a712325bb18984c98fbb1e60d183cd651e4",
          "url": "https://github.com/TanStack/router/commit/51a97a167fb3ef1b8ca70fbb63db635158f43509"
        },
        "date": 1779581070455,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89390,
            "unit": "bytes",
            "extra": "raw=280599; brotli=77755; initial_gzip=89250"
          },
          {
            "name": "react-router.full",
            "value": 92912,
            "unit": "bytes",
            "extra": "raw=292235; brotli=80720; initial_gzip=92771"
          },
          {
            "name": "solid-router.minimal",
            "value": 36384,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32720; initial_gzip=36256"
          },
          {
            "name": "solid-router.full",
            "value": 41203,
            "unit": "bytes",
            "extra": "raw=123420; brotli=37074; initial_gzip=41075"
          },
          {
            "name": "vue-router.minimal",
            "value": 54606,
            "unit": "bytes",
            "extra": "raw=155099; brotli=49030; initial_gzip=54474"
          },
          {
            "name": "vue-router.full",
            "value": 60198,
            "unit": "bytes",
            "extra": "raw=172685; brotli=53969; initial_gzip=60066"
          },
          {
            "name": "react-start.minimal",
            "value": 104369,
            "unit": "bytes",
            "extra": "raw=330080; brotli=90257; initial_gzip=104230"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105428,
            "unit": "bytes",
            "extra": "raw=331762; brotli=91271; initial_gzip=104533"
          },
          {
            "name": "react-start.full",
            "value": 107842,
            "unit": "bytes",
            "extra": "raw=340642; brotli=93183; initial_gzip=107700"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101996,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87807; initial_gzip=101820"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105348,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90631; initial_gzip=105172"
          },
          {
            "name": "solid-start.minimal",
            "value": 50817,
            "unit": "bytes",
            "extra": "raw=156061; brotli=44893; initial_gzip=50684"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54992,
            "unit": "bytes",
            "extra": "raw=164802; brotli=48960; initial_gzip=51564"
          },
          {
            "name": "solid-start.full",
            "value": 56746,
            "unit": "bytes",
            "extra": "raw=173404; brotli=49910; initial_gzip=56615"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "658c2241458e5252eb688dbfc4acbd22c653376c",
          "message": "ci: Version Packages (#7478)",
          "timestamp": "2026-05-24T02:15:23+02:00",
          "tree_id": "77a568c01fbae8eca15a1e827d79d73d30e14d11",
          "url": "https://github.com/TanStack/router/commit/658c2241458e5252eb688dbfc4acbd22c653376c"
        },
        "date": 1779581869639,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89390,
            "unit": "bytes",
            "extra": "raw=280599; brotli=77755; initial_gzip=89250"
          },
          {
            "name": "react-router.full",
            "value": 92912,
            "unit": "bytes",
            "extra": "raw=292235; brotli=80720; initial_gzip=92771"
          },
          {
            "name": "solid-router.minimal",
            "value": 36384,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32720; initial_gzip=36256"
          },
          {
            "name": "solid-router.full",
            "value": 41203,
            "unit": "bytes",
            "extra": "raw=123420; brotli=37074; initial_gzip=41075"
          },
          {
            "name": "vue-router.minimal",
            "value": 54606,
            "unit": "bytes",
            "extra": "raw=155099; brotli=49030; initial_gzip=54474"
          },
          {
            "name": "vue-router.full",
            "value": 60198,
            "unit": "bytes",
            "extra": "raw=172685; brotli=53969; initial_gzip=60066"
          },
          {
            "name": "react-start.minimal",
            "value": 104369,
            "unit": "bytes",
            "extra": "raw=330080; brotli=90257; initial_gzip=104230"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105428,
            "unit": "bytes",
            "extra": "raw=331762; brotli=91271; initial_gzip=104533"
          },
          {
            "name": "react-start.full",
            "value": 107842,
            "unit": "bytes",
            "extra": "raw=340642; brotli=93183; initial_gzip=107700"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101996,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87807; initial_gzip=101820"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105348,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90631; initial_gzip=105172"
          },
          {
            "name": "solid-start.minimal",
            "value": 50817,
            "unit": "bytes",
            "extra": "raw=156061; brotli=44893; initial_gzip=50684"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54992,
            "unit": "bytes",
            "extra": "raw=164802; brotli=48960; initial_gzip=51564"
          },
          {
            "name": "solid-start.full",
            "value": 56746,
            "unit": "bytes",
            "extra": "raw=173404; brotli=49910; initial_gzip=56615"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "90adda91aab7212cbcdb6159176b39d9ed01b827",
          "message": "fix: bundled dev support for vite (#7482)",
          "timestamp": "2026-05-24T22:08:23+02:00",
          "tree_id": "bcd3eb60247b649f3bfcf1a2a45fc685d624462f",
          "url": "https://github.com/TanStack/router/commit/90adda91aab7212cbcdb6159176b39d9ed01b827"
        },
        "date": 1779653444673,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101996,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87807; initial_gzip=101820"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105348,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90631; initial_gzip=105172"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "abd44ddf2bfab89395595978cdeb34589e2e590b",
          "message": "ci: Version Packages (#7483)",
          "timestamp": "2026-05-24T22:15:30+02:00",
          "tree_id": "e28dd081f06d4af5c735ccb560c33ca83afeba2b",
          "url": "https://github.com/TanStack/router/commit/abd44ddf2bfab89395595978cdeb34589e2e590b"
        },
        "date": 1779653876923,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101996,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87807; initial_gzip=101820"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105348,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90631; initial_gzip=105172"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a82cec69474c366b36efdb3f43c4efe8311c485a",
          "message": "fix(start): avoid encoded virtual adapter ids in vite dev (#7484)",
          "timestamp": "2026-05-25T01:01:47+02:00",
          "tree_id": "223b53fbd429de974a184d817958a49928d58e2f",
          "url": "https://github.com/TanStack/router/commit/a82cec69474c366b36efdb3f43c4efe8311c485a"
        },
        "date": 1779663847952,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "eb830eaa457c924a8b870ef4c18e0128f5365d3f",
          "message": "ci: Version Packages (#7485)",
          "timestamp": "2026-05-25T08:57:06+02:00",
          "tree_id": "ae033ab30803a386e727a2b262742b13f52a30e4",
          "url": "https://github.com/TanStack/router/commit/eb830eaa457c924a8b870ef4c18e0128f5365d3f"
        },
        "date": 1779692373328,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "71fb3297e93a126e1bcfd9eeb0626cc4b8df8dd8",
          "message": "fix: Fix Hydrate re-exports to avoid circular HMR updates (#7492)",
          "timestamp": "2026-05-26T21:54:14+02:00",
          "tree_id": "f01bce895bfe12302d7af864877f62927361216c",
          "url": "https://github.com/TanStack/router/commit/71fb3297e93a126e1bcfd9eeb0626cc4b8df8dd8"
        },
        "date": 1779825406730,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c",
          "message": "ci: Version Packages (#7493)",
          "timestamp": "2026-05-26T22:23:30+02:00",
          "tree_id": "0df084793275d1752aa463506b5f5b3b56260287",
          "url": "https://github.com/TanStack/router/commit/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c"
        },
        "date": 1779827157481,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9c09bca59e9613e9a6fd9b7149b0737898e705d6",
          "message": "fix(start): emit boot-sibling chunks as scripts for IIFE entries (#7501)\n\nCo-authored-by: Keven Arroyo <kevenarroyo@microsoft.com>",
          "timestamp": "2026-05-29T01:42:05+02:00",
          "tree_id": "fb460ca5b6937424345be23ade95ce5df70bad6a",
          "url": "https://github.com/TanStack/router/commit/9c09bca59e9613e9a6fd9b7149b0737898e705d6"
        },
        "date": 1780011870595,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c79b3964121c24cc3a7d9f5ed77a9f3a876c28d8",
          "message": "ci: Version Packages (#7502)",
          "timestamp": "2026-05-29T01:49:27+02:00",
          "tree_id": "d7c1dbd08d82e91a32fe7336766ad826cf2837d2",
          "url": "https://github.com/TanStack/router/commit/c79b3964121c24cc3a7d9f5ed77a9f3a876c28d8"
        },
        "date": 1780012312053,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48",
          "message": "fix: fix streaming (#7497)",
          "timestamp": "2026-05-29T02:27:23+02:00",
          "tree_id": "63ce60d75fd63c1ec0cde0b3c4fb95d1526d3c8a",
          "url": "https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48"
        },
        "date": 1780014597302,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8b3659143f634542c455a9d7915a8c7e8fabb65d",
          "message": "ci: Version Packages (#7504)\n\nci: changeset release\n\nCo-authored-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-29T02:32:18+02:00",
          "tree_id": "80b1e5281738e0f6ce49c1548b2172ed61a51fd1",
          "url": "https://github.com/TanStack/router/commit/8b3659143f634542c455a9d7915a8c7e8fabb65d"
        },
        "date": 1780014860654,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89397,
            "unit": "bytes",
            "extra": "raw=280608; brotli=77744; initial_gzip=89256"
          },
          {
            "name": "react-router.full",
            "value": 92931,
            "unit": "bytes",
            "extra": "raw=292240; brotli=80693; initial_gzip=92789"
          },
          {
            "name": "solid-router.minimal",
            "value": 36385,
            "unit": "bytes",
            "extra": "raw=108884; brotli=32775; initial_gzip=36257"
          },
          {
            "name": "solid-router.full",
            "value": 41199,
            "unit": "bytes",
            "extra": "raw=123416; brotli=37055; initial_gzip=41070"
          },
          {
            "name": "vue-router.minimal",
            "value": 54294,
            "unit": "bytes",
            "extra": "raw=153955; brotli=48703; initial_gzip=54163"
          },
          {
            "name": "vue-router.full",
            "value": 60053,
            "unit": "bytes",
            "extra": "raw=172113; brotli=53809; initial_gzip=59921"
          },
          {
            "name": "react-start.minimal",
            "value": 104372,
            "unit": "bytes",
            "extra": "raw=330085; brotli=90367; initial_gzip=104232"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105125,
            "unit": "bytes",
            "extra": "raw=331493; brotli=90956; initial_gzip=104255"
          },
          {
            "name": "react-start.full",
            "value": 107839,
            "unit": "bytes",
            "extra": "raw=340643; brotli=93246; initial_gzip=107697"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101999,
            "unit": "bytes",
            "extra": "raw=324392; brotli=87790; initial_gzip=101823"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105346,
            "unit": "bytes",
            "extra": "raw=335034; brotli=90644; initial_gzip=105170"
          },
          {
            "name": "solid-start.minimal",
            "value": 50816,
            "unit": "bytes",
            "extra": "raw=156057; brotli=44897; initial_gzip=50683"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54157,
            "unit": "bytes",
            "extra": "raw=164289; brotli=47835; initial_gzip=50741"
          },
          {
            "name": "solid-start.full",
            "value": 56744,
            "unit": "bytes",
            "extra": "raw=173392; brotli=49985; initial_gzip=56612"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2f5374945e2138559a51464f45a5152eae67e1dd",
          "message": "fix: fix primitive beforeLoad errors (#7505)\n\n* fix: fix primitive beforeLoad errors\n\n* ci: apply automated fixes\n\n---------\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-30T01:29:42+02:00",
          "tree_id": "2cb5adfc3771d354f8a08dc0de504c15316a9d25",
          "url": "https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd"
        },
        "date": 1780097531985,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101947,
            "unit": "bytes",
            "extra": "raw=324300; brotli=87676; initial_gzip=101771"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105294,
            "unit": "bytes",
            "extra": "raw=334942; brotli=90584; initial_gzip=105118"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0ac831bdf798df7990f8454e103bc82209981b89",
          "message": "ci: Version Packages (#7508)",
          "timestamp": "2026-05-30T02:44:11+02:00",
          "tree_id": "fb0a49f58de848b52a54daf2d5bf649b1d36139d",
          "url": "https://github.com/TanStack/router/commit/0ac831bdf798df7990f8454e103bc82209981b89"
        },
        "date": 1780101998876,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101947,
            "unit": "bytes",
            "extra": "raw=324300; brotli=87676; initial_gzip=101771"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105294,
            "unit": "bytes",
            "extra": "raw=334942; brotli=90584; initial_gzip=105118"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9cb7a003e6e5fa3706711870c7b10a5266356e3b",
          "message": "feat(rsbuild): add RSC support (#7509)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-05-30T15:16:10+02:00",
          "tree_id": "0a4e04ac9856a66c33353582bfd7e934c6df5414",
          "url": "https://github.com/TanStack/router/commit/9cb7a003e6e5fa3706711870c7b10a5266356e3b"
        },
        "date": 1780147116753,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9a6c12596ff677407784648f64ce48bfd02ee36b",
          "message": "ci: Version Packages (#7513)",
          "timestamp": "2026-05-30T15:22:58+02:00",
          "tree_id": "ce8108bb325e0b9f26cf40087ca015acf7567a8b",
          "url": "https://github.com/TanStack/router/commit/9a6c12596ff677407784648f64ce48bfd02ee36b"
        },
        "date": 1780147525639,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778",
          "message": "fix(router-core): defer $_TSR teardown until DOMContentLoaded (#7524)",
          "timestamp": "2026-06-02T22:29:15+02:00",
          "tree_id": "a3151564b4a6f33bceb481cfd1c15b84b21879c1",
          "url": "https://github.com/TanStack/router/commit/b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778"
        },
        "date": 1780432300011,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7fc7c346dc7d48d7784dc7b3b792010e0066fd64",
          "message": "ci: Version Packages (#7525)\n\nci: changeset release\n\nCo-authored-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
          "timestamp": "2026-06-02T22:50:10+02:00",
          "tree_id": "774069469bc9d578707630963dd03b42979da62c",
          "url": "https://github.com/TanStack/router/commit/7fc7c346dc7d48d7784dc7b3b792010e0066fd64"
        },
        "date": 1780433551995,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tannerlinsley@gmail.com",
            "name": "Tanner Linsley",
            "username": "tannerlinsley"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ccf87fbe6f66954d4997e869b2c7e1e95b1390ef",
          "message": "docs: clarify auth data boundaries (#7537)",
          "timestamp": "2026-06-03T12:48:48-06:00",
          "tree_id": "1f88bea839217a4d5aac533f9ba9360a10551f70",
          "url": "https://github.com/TanStack/router/commit/ccf87fbe6f66954d4997e869b2c7e1e95b1390ef"
        },
        "date": 1780512685372,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "dacongsama@live.com",
            "name": "Cong-Cong Pan",
            "username": "SyMind"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "80919186cbdd0deb948b46fe328881a14a08f414",
          "message": "fix(start-rsbuild): compile node_modules for RSC directives (#7540)\n\n* fix(start-rsbuild): compile node_modules for RSC directives\n\n* chore: add comments\n\n* chore: add changeset",
          "timestamp": "2026-06-04T13:34:00+02:00",
          "tree_id": "3f0764d1cb1bd5fdf1c240712e1f7a39323e73c7",
          "url": "https://github.com/TanStack/router/commit/80919186cbdd0deb948b46fe328881a14a08f414"
        },
        "date": 1780572991130,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "41898282+github-actions[bot]@users.noreply.github.com",
            "name": "github-actions[bot]",
            "username": "github-actions[bot]"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8c7e54ea2d58620780271e4738c61507c950d1e0",
          "message": "ci: Version Packages (#7544)",
          "timestamp": "2026-06-04T13:56:45+02:00",
          "tree_id": "5d15f12a398673218724b3f1446323cfbd99e1d7",
          "url": "https://github.com/TanStack/router/commit/8c7e54ea2d58620780271e4738c61507c950d1e0"
        },
        "date": 1780574355839,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "8657779+ulrichstark@users.noreply.github.com",
            "name": "Ulrich Stark",
            "username": "ulrichstark"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bb99f66a4780b3949c25b7bb4b399ffc85a36717",
          "message": "refactor: remove unnecessary any assertions (#7542)",
          "timestamp": "2026-06-04T22:12:45+02:00",
          "tree_id": "5a36394e930089e86e73f9c01c57c43e69d2a64d",
          "url": "https://github.com/TanStack/router/commit/bb99f66a4780b3949c25b7bb4b399ffc85a36717"
        },
        "date": 1780604243260,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3dcc016fc19c0ef210de0aced7872d1443cdf8da",
          "message": "improve bundle size benchmarks and add initial skill (#7450)",
          "timestamp": "2026-06-04T22:48:53+02:00",
          "tree_id": "a4a4a1c152ad960c6a3d475e58c971c49d553348",
          "url": "https://github.com/TanStack/router/commit/3dcc016fc19c0ef210de0aced7872d1443cdf8da"
        },
        "date": 1780606311614,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89346,
            "unit": "bytes",
            "extra": "raw=280516; brotli=77661; initial_gzip=89206"
          },
          {
            "name": "react-router.full",
            "value": 92865,
            "unit": "bytes",
            "extra": "raw=292148; brotli=80723; initial_gzip=92725"
          },
          {
            "name": "solid-router.minimal",
            "value": 36325,
            "unit": "bytes",
            "extra": "raw=108792; brotli=32768; initial_gzip=36197"
          },
          {
            "name": "solid-router.full",
            "value": 41143,
            "unit": "bytes",
            "extra": "raw=123324; brotli=37053; initial_gzip=41013"
          },
          {
            "name": "vue-router.minimal",
            "value": 54242,
            "unit": "bytes",
            "extra": "raw=153863; brotli=48807; initial_gzip=54111"
          },
          {
            "name": "vue-router.full",
            "value": 60004,
            "unit": "bytes",
            "extra": "raw=172021; brotli=53775; initial_gzip=59870"
          },
          {
            "name": "react-start.minimal",
            "value": 104321,
            "unit": "bytes",
            "extra": "raw=329993; brotli=90263; initial_gzip=104181"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105072,
            "unit": "bytes",
            "extra": "raw=331401; brotli=90952; initial_gzip=104202"
          },
          {
            "name": "react-start.full",
            "value": 107782,
            "unit": "bytes",
            "extra": "raw=340551; brotli=93273; initial_gzip=107641"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101971,
            "unit": "bytes",
            "extra": "raw=324340; brotli=87793; initial_gzip=101795"
          },
          {
            "name": "react-start.rsbuild.minimal-iife",
            "value": 102378,
            "unit": "bytes",
            "extra": "raw=325299; brotli=88031; initial_gzip=102209"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105319,
            "unit": "bytes",
            "extra": "raw=334982; brotli=90573; initial_gzip=105143"
          },
          {
            "name": "solid-start.minimal",
            "value": 50770,
            "unit": "bytes",
            "extra": "raw=155965; brotli=44835; initial_gzip=50638"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54112,
            "unit": "bytes",
            "extra": "raw=164197; brotli=47881; initial_gzip=50698"
          },
          {
            "name": "solid-start.full",
            "value": 56699,
            "unit": "bytes",
            "extra": "raw=173300; brotli=49926; initial_gzip=56566"
          },
          {
            "name": "vue-start.minimal",
            "value": 72709,
            "unit": "bytes",
            "extra": "raw=212377; brotli=64390; initial_gzip=72578"
          },
          {
            "name": "vue-start.full",
            "value": 76767,
            "unit": "bytes",
            "extra": "raw=225197; brotli=67978; initial_gzip=76634"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7a83e67e6596fbef21cb0a88a7127f5935bed2ba",
          "message": "fix(router-core): retain search over validation defaults (#7549)",
          "timestamp": "2026-06-04T23:25:25+02:00",
          "tree_id": "d23437bb82789af6ca4c1b4442fe3d783abb9fd1",
          "url": "https://github.com/TanStack/router/commit/7a83e67e6596fbef21cb0a88a7127f5935bed2ba"
        },
        "date": 1780608477243,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89303,
            "unit": "bytes",
            "extra": "raw=280217; brotli=77704; initial_gzip=89163"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=291849; brotli=80711; initial_gzip=92683"
          },
          {
            "name": "solid-router.minimal",
            "value": 36288,
            "unit": "bytes",
            "extra": "raw=108493; brotli=32655; initial_gzip=36158"
          },
          {
            "name": "solid-router.full",
            "value": 41087,
            "unit": "bytes",
            "extra": "raw=123025; brotli=37030; initial_gzip=40960"
          },
          {
            "name": "vue-router.minimal",
            "value": 54186,
            "unit": "bytes",
            "extra": "raw=153564; brotli=48745; initial_gzip=54054"
          },
          {
            "name": "vue-router.full",
            "value": 59960,
            "unit": "bytes",
            "extra": "raw=171722; brotli=53663; initial_gzip=59825"
          },
          {
            "name": "react-start.minimal",
            "value": 104264,
            "unit": "bytes",
            "extra": "raw=329694; brotli=90145; initial_gzip=104125"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105021,
            "unit": "bytes",
            "extra": "raw=331102; brotli=90936; initial_gzip=104149"
          },
          {
            "name": "react-start.full",
            "value": 107740,
            "unit": "bytes",
            "extra": "raw=340252; brotli=93182; initial_gzip=107601"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101933,
            "unit": "bytes",
            "extra": "raw=324038; brotli=87708; initial_gzip=101757"
          },
          {
            "name": "react-start.rsbuild.minimal-iife",
            "value": 102338,
            "unit": "bytes",
            "extra": "raw=324997; brotli=88077; initial_gzip=102169"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105268,
            "unit": "bytes",
            "extra": "raw=334680; brotli=90530; initial_gzip=105092"
          },
          {
            "name": "solid-start.minimal",
            "value": 50734,
            "unit": "bytes",
            "extra": "raw=155666; brotli=44861; initial_gzip=50603"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54077,
            "unit": "bytes",
            "extra": "raw=163898; brotli=47832; initial_gzip=50663"
          },
          {
            "name": "solid-start.full",
            "value": 56654,
            "unit": "bytes",
            "extra": "raw=173001; brotli=49892; initial_gzip=56521"
          },
          {
            "name": "vue-start.minimal",
            "value": 72666,
            "unit": "bytes",
            "extra": "raw=212078; brotli=64405; initial_gzip=72533"
          },
          {
            "name": "vue-start.full",
            "value": 76722,
            "unit": "bytes",
            "extra": "raw=224898; brotli=67847; initial_gzip=76590"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fb0399e8c4762b2cbbe74be957713da487dee368",
          "message": "fix build (#7550)",
          "timestamp": "2026-06-04T23:45:39+02:00",
          "tree_id": "898fae5071700fa37e328d438f5b581a7c7f409e",
          "url": "https://github.com/TanStack/router/commit/fb0399e8c4762b2cbbe74be957713da487dee368"
        },
        "date": 1780609691208,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89303,
            "unit": "bytes",
            "extra": "raw=280217; brotli=77704; initial_gzip=89163"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=291849; brotli=80711; initial_gzip=92683"
          },
          {
            "name": "solid-router.minimal",
            "value": 36288,
            "unit": "bytes",
            "extra": "raw=108493; brotli=32655; initial_gzip=36158"
          },
          {
            "name": "solid-router.full",
            "value": 41087,
            "unit": "bytes",
            "extra": "raw=123025; brotli=37030; initial_gzip=40960"
          },
          {
            "name": "vue-router.minimal",
            "value": 54186,
            "unit": "bytes",
            "extra": "raw=153564; brotli=48745; initial_gzip=54054"
          },
          {
            "name": "vue-router.full",
            "value": 59960,
            "unit": "bytes",
            "extra": "raw=171722; brotli=53663; initial_gzip=59825"
          },
          {
            "name": "react-start.minimal",
            "value": 104264,
            "unit": "bytes",
            "extra": "raw=329694; brotli=90145; initial_gzip=104125"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105021,
            "unit": "bytes",
            "extra": "raw=331102; brotli=90936; initial_gzip=104149"
          },
          {
            "name": "react-start.full",
            "value": 107740,
            "unit": "bytes",
            "extra": "raw=340252; brotli=93182; initial_gzip=107601"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101933,
            "unit": "bytes",
            "extra": "raw=324038; brotli=87708; initial_gzip=101757"
          },
          {
            "name": "react-start.rsbuild.minimal-iife",
            "value": 102338,
            "unit": "bytes",
            "extra": "raw=324997; brotli=88077; initial_gzip=102169"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105268,
            "unit": "bytes",
            "extra": "raw=334680; brotli=90530; initial_gzip=105092"
          },
          {
            "name": "solid-start.minimal",
            "value": 50734,
            "unit": "bytes",
            "extra": "raw=155666; brotli=44861; initial_gzip=50603"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54077,
            "unit": "bytes",
            "extra": "raw=163898; brotli=47832; initial_gzip=50663"
          },
          {
            "name": "solid-start.full",
            "value": 56654,
            "unit": "bytes",
            "extra": "raw=173001; brotli=49892; initial_gzip=56521"
          },
          {
            "name": "vue-start.minimal",
            "value": 72666,
            "unit": "bytes",
            "extra": "raw=212078; brotli=64405; initial_gzip=72533"
          },
          {
            "name": "vue-start.full",
            "value": 76722,
            "unit": "bytes",
            "extra": "raw=224898; brotli=67847; initial_gzip=76590"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "74932975+birkskyum@users.noreply.github.com",
            "name": "Birk Skyum",
            "username": "birkskyum"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "76b3d3b24522bd3d1d216674c441252c9b8f184c",
          "message": "Revert #7524 (#7533)\n\nCo-authored-by: autofix-ci[bot] <114827586+autofix-ci[bot]@users.noreply.github.com>",
          "timestamp": "2026-06-05T00:04:55+02:00",
          "tree_id": "8d45173caa37580f001fcd02f0d410fea76cec13",
          "url": "https://github.com/TanStack/router/commit/76b3d3b24522bd3d1d216674c441252c9b8f184c"
        },
        "date": 1780610857618,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89303,
            "unit": "bytes",
            "extra": "raw=280217; brotli=77704; initial_gzip=89163"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=291849; brotli=80711; initial_gzip=92683"
          },
          {
            "name": "solid-router.minimal",
            "value": 36288,
            "unit": "bytes",
            "extra": "raw=108493; brotli=32655; initial_gzip=36158"
          },
          {
            "name": "solid-router.full",
            "value": 41087,
            "unit": "bytes",
            "extra": "raw=123025; brotli=37030; initial_gzip=40960"
          },
          {
            "name": "vue-router.minimal",
            "value": 54186,
            "unit": "bytes",
            "extra": "raw=153564; brotli=48745; initial_gzip=54054"
          },
          {
            "name": "vue-router.full",
            "value": 59960,
            "unit": "bytes",
            "extra": "raw=171722; brotli=53663; initial_gzip=59825"
          },
          {
            "name": "react-start.minimal",
            "value": 104264,
            "unit": "bytes",
            "extra": "raw=329694; brotli=90145; initial_gzip=104125"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105021,
            "unit": "bytes",
            "extra": "raw=331102; brotli=90936; initial_gzip=104149"
          },
          {
            "name": "react-start.full",
            "value": 107740,
            "unit": "bytes",
            "extra": "raw=340252; brotli=93182; initial_gzip=107601"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101933,
            "unit": "bytes",
            "extra": "raw=324038; brotli=87708; initial_gzip=101757"
          },
          {
            "name": "react-start.rsbuild.minimal-iife",
            "value": 102338,
            "unit": "bytes",
            "extra": "raw=324997; brotli=88077; initial_gzip=102169"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105268,
            "unit": "bytes",
            "extra": "raw=334680; brotli=90530; initial_gzip=105092"
          },
          {
            "name": "solid-start.minimal",
            "value": 50734,
            "unit": "bytes",
            "extra": "raw=155666; brotli=44861; initial_gzip=50603"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54077,
            "unit": "bytes",
            "extra": "raw=163898; brotli=47832; initial_gzip=50663"
          },
          {
            "name": "solid-start.full",
            "value": 56654,
            "unit": "bytes",
            "extra": "raw=173001; brotli=49892; initial_gzip=56521"
          },
          {
            "name": "vue-start.minimal",
            "value": 72666,
            "unit": "bytes",
            "extra": "raw=212078; brotli=64405; initial_gzip=72533"
          },
          {
            "name": "vue-start.full",
            "value": 76722,
            "unit": "bytes",
            "extra": "raw=224898; brotli=67847; initial_gzip=76590"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "301f6ba4599386edd6fb3b8423938c48eedb501f",
          "message": "fix(start): clean up server function handler imports (#7552)\n\nCo-authored-by: nx-cloud[bot] <71083854+nx-cloud[bot]@users.noreply.github.com>",
          "timestamp": "2026-06-05T21:30:23+02:00",
          "tree_id": "f6aadebc44fa558963d10d01a187d504468476b2",
          "url": "https://github.com/TanStack/router/commit/301f6ba4599386edd6fb3b8423938c48eedb501f"
        },
        "date": 1780687985438,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89303,
            "unit": "bytes",
            "extra": "raw=280217; brotli=77704; initial_gzip=89163"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=291849; brotli=80711; initial_gzip=92683"
          },
          {
            "name": "solid-router.minimal",
            "value": 36288,
            "unit": "bytes",
            "extra": "raw=108493; brotli=32655; initial_gzip=36158"
          },
          {
            "name": "solid-router.full",
            "value": 41087,
            "unit": "bytes",
            "extra": "raw=123025; brotli=37030; initial_gzip=40960"
          },
          {
            "name": "vue-router.minimal",
            "value": 54186,
            "unit": "bytes",
            "extra": "raw=153564; brotli=48745; initial_gzip=54054"
          },
          {
            "name": "vue-router.full",
            "value": 59960,
            "unit": "bytes",
            "extra": "raw=171722; brotli=53663; initial_gzip=59825"
          },
          {
            "name": "react-start.minimal",
            "value": 104264,
            "unit": "bytes",
            "extra": "raw=329694; brotli=90145; initial_gzip=104125"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105021,
            "unit": "bytes",
            "extra": "raw=331102; brotli=90936; initial_gzip=104149"
          },
          {
            "name": "react-start.full",
            "value": 107740,
            "unit": "bytes",
            "extra": "raw=340252; brotli=93182; initial_gzip=107601"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101933,
            "unit": "bytes",
            "extra": "raw=324038; brotli=87708; initial_gzip=101757"
          },
          {
            "name": "react-start.rsbuild.minimal-iife",
            "value": 102338,
            "unit": "bytes",
            "extra": "raw=324997; brotli=88077; initial_gzip=102169"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105268,
            "unit": "bytes",
            "extra": "raw=334680; brotli=90530; initial_gzip=105092"
          },
          {
            "name": "solid-start.minimal",
            "value": 50734,
            "unit": "bytes",
            "extra": "raw=155666; brotli=44861; initial_gzip=50603"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54077,
            "unit": "bytes",
            "extra": "raw=163898; brotli=47832; initial_gzip=50663"
          },
          {
            "name": "solid-start.full",
            "value": 56654,
            "unit": "bytes",
            "extra": "raw=173001; brotli=49892; initial_gzip=56521"
          },
          {
            "name": "vue-start.minimal",
            "value": 72666,
            "unit": "bytes",
            "extra": "raw=212078; brotli=64405; initial_gzip=72533"
          },
          {
            "name": "vue-start.full",
            "value": 76722,
            "unit": "bytes",
            "extra": "raw=224898; brotli=67847; initial_gzip=76590"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "manuel.schiller@caligano.de",
            "name": "Manuel Schiller",
            "username": "schiller-manuel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6b453dfafcccc388a894031db9d31504f0510b4f",
          "message": "fix build (#7553)",
          "timestamp": "2026-06-05T21:56:19+02:00",
          "tree_id": "c6f81ab0a24b3d48511073aaf59a4818a713c4dd",
          "url": "https://github.com/TanStack/router/commit/6b453dfafcccc388a894031db9d31504f0510b4f"
        },
        "date": 1780689554009,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "react-router.minimal",
            "value": 89303,
            "unit": "bytes",
            "extra": "raw=280217; brotli=77704; initial_gzip=89163"
          },
          {
            "name": "react-router.full",
            "value": 92821,
            "unit": "bytes",
            "extra": "raw=291849; brotli=80711; initial_gzip=92683"
          },
          {
            "name": "solid-router.minimal",
            "value": 36288,
            "unit": "bytes",
            "extra": "raw=108493; brotli=32655; initial_gzip=36158"
          },
          {
            "name": "solid-router.full",
            "value": 41087,
            "unit": "bytes",
            "extra": "raw=123025; brotli=37030; initial_gzip=40960"
          },
          {
            "name": "vue-router.minimal",
            "value": 54186,
            "unit": "bytes",
            "extra": "raw=153564; brotli=48745; initial_gzip=54054"
          },
          {
            "name": "vue-router.full",
            "value": 59960,
            "unit": "bytes",
            "extra": "raw=171722; brotli=53663; initial_gzip=59825"
          },
          {
            "name": "react-start.minimal",
            "value": 104264,
            "unit": "bytes",
            "extra": "raw=329694; brotli=90145; initial_gzip=104125"
          },
          {
            "name": "react-start.deferred-hydration",
            "value": 105021,
            "unit": "bytes",
            "extra": "raw=331102; brotli=90936; initial_gzip=104149"
          },
          {
            "name": "react-start.full",
            "value": 107740,
            "unit": "bytes",
            "extra": "raw=340252; brotli=93182; initial_gzip=107601"
          },
          {
            "name": "react-start.rsbuild.minimal",
            "value": 101933,
            "unit": "bytes",
            "extra": "raw=324038; brotli=87708; initial_gzip=101757"
          },
          {
            "name": "react-start.rsbuild.minimal-iife",
            "value": 102338,
            "unit": "bytes",
            "extra": "raw=324997; brotli=88077; initial_gzip=102169"
          },
          {
            "name": "react-start.rsbuild.full",
            "value": 105268,
            "unit": "bytes",
            "extra": "raw=334680; brotli=90530; initial_gzip=105092"
          },
          {
            "name": "solid-start.minimal",
            "value": 50734,
            "unit": "bytes",
            "extra": "raw=155666; brotli=44861; initial_gzip=50603"
          },
          {
            "name": "solid-start.deferred-hydration",
            "value": 54077,
            "unit": "bytes",
            "extra": "raw=163898; brotli=47832; initial_gzip=50663"
          },
          {
            "name": "solid-start.full",
            "value": 56654,
            "unit": "bytes",
            "extra": "raw=173001; brotli=49892; initial_gzip=56521"
          },
          {
            "name": "vue-start.minimal",
            "value": 72666,
            "unit": "bytes",
            "extra": "raw=212078; brotli=64405; initial_gzip=72533"
          },
          {
            "name": "vue-start.full",
            "value": 76722,
            "unit": "bytes",
            "extra": "raw=224898; brotli=67847; initial_gzip=76590"
          }
        ]
      }
    ]
  }
}