# Branch-uri șterse — 2026-09-05

Rămășițe de la rulări cu agenți în paralel (mai–iunie 2026), plus un branch de audit
care era integral în `main`. Conținutul lor e în aplicație; commit-urile au ajuns pe
`main` prin altă cale decât un merge, ceea ce face ca `git rev-list main..branch` să
raporteze sute de commit-uri "neintegrate" care nu sunt muncă pierdută.

Ștergerea e reversibilă: `git push origin <sha>:refs/heads/<nume>`

```
54c0beb58fba3d8f3e7c74c5d8d3ed147b0dc5a1 claude/app-documentation-audit-y7gc9g
e825f4e09d120fa39af85b43765a6e3b4c9a6bdb worktree-agent-a01912d993a942b0f
dbba57f1830ff4a44ab510aa24a1e188dc6a73c7 worktree-agent-a0eee58c9aca11dc2
ad9dd4da4b03614491d265c0fa9bf8c21cc6452e worktree-agent-a10676158ed4e009c
0b61c75bae66a7856f0fa104eb19af56299d6e98 worktree-agent-a23ad1b7d3aeb81c5
67c07ca4cbe772bbe80f676342b91ec1d4d3132d worktree-agent-a33056528f04f9376
2795d0865dc174196e5e44a4da4e206fcc26a41a worktree-agent-a346ff86e56094a8d
5514db0aac3334664e9410c5c843ececd72a312c worktree-agent-a482872246a17e272
6491f5b5a7dba5b44e8897a0cbf01796968d60be worktree-agent-a52d6d56209b4e9aa
b30bb8652b834ae1b997cdd6810d5bc4510b4bbf worktree-agent-a9459b3269ede6a1b
30a8ec895ba4739a99b3478f74a3fc386a6befb3 worktree-agent-aa4dd7bd3b8e749ce
442abf5114d5f2f42bb15231a2f0cf463347e0df worktree-agent-aa7e0911e5e497883
0b8af9aaf2e421d40295cedc92ba69ecf937758d worktree-agent-ac84bafaa0c7adf75
605f57ad10cc6dd672622553558ec575ac071012 worktree-agent-ad97b50635392bed3
bf46ab4c668a4487902d6590cd612bed44c13f83 worktree-agent-aea9659857f307a98
ade0ba0d510c9045bd4d28eb943affa8135a5ac0 worktree-agent-afdf373a646f85ccb
```
