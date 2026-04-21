# Patch backend Medusa — Sistema de etiquetas desacoplado

Este diretório é **documentação / versionamento** dos arquivos que vivem
em `/home/root/medusa-backend/` (outro repo fora deste workspace).

## Arquivos

- `route.ts` → `src/api/admin/remessas/labels/route.ts`
- `download_route.ts` → `src/api/admin/remessas/labels/download/route.ts`
- `individual_route.ts` → `src/api/admin/remessas/labels/individual/route.ts`
- `migration_up.sql` / `migration_down.sql` → migração idempotente da tabela `remessa_label_jobs`.

## Como reaplicar do zero

```bash
cd /home/root/medusa-backend
mkdir -p src/api/admin/remessas/labels/download src/api/admin/remessas/labels/individual
cp <este dir>/route.ts              src/api/admin/remessas/labels/route.ts
cp <este dir>/download_route.ts     src/api/admin/remessas/labels/download/route.ts
cp <este dir>/individual_route.ts   src/api/admin/remessas/labels/individual/route.ts
PGPASSWORD=... psql -h localhost -U postgres -d medusa_db -f <este dir>/migration_up.sql
npx medusa build
pm2 restart medusa
```

## Como reverter

```bash
rm -rf /home/root/medusa-backend/src/api/admin/remessas/labels
PGPASSWORD=... psql -h localhost -U postgres -d medusa_db -f <este dir>/migration_down.sql
npx medusa build
pm2 restart medusa
```
