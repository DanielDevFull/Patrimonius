import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAsset, revalueAsset } from '@/db/repo';
import { renderWithProviders, resetDb } from '@/test/render';
import { RevalueModal } from './RevalueModal';

const TODAY = '2026-10-01';

async function seedCar() {
  const asset = await addAsset(
    {
      name: 'Carro',
      type: 'veiculo',
      value: 5000000,
      acquisitionValue: null,
      acquisitionDate: null,
      notes: '',
      archived: false,
    },
    '2026-08-01',
  );
  await revalueAsset(asset.id, 450000, '2026-09-01'); // digitado errado (faltou um zero)
  return asset;
}

async function history(assetId: string) {
  const all = await db.assetValuations.where('assetId').equals(assetId).toArray();
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

describe('RevalueModal', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('exclui uma avaliação lançada errado e o valor atual volta para a mais recente que sobrou', async () => {
    const car = await seedCar();
    const current = await db.assets.get(car.id);
    expect(current?.value).toBe(450000);
    const user = userEvent.setup();
    renderWithProviders(
      <RevalueModal asset={current!} history={await history(car.id)} today={TODAY} onClose={vi.fn()} />,
    );
    const dialog = within(await screen.findByRole('dialog', { name: 'Atualizar valor: Carro' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir avaliação de 01/09/2026' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Excluir avaliação?' }));
    await user.click(confirm.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Avaliação excluída.')).toBeInTheDocument();
    expect((await history(car.id)).map((v) => v.date)).toEqual(['2026-08-01']);
    expect((await db.assets.get(car.id))?.value).toBe(5000000);
  });

  it('com uma única avaliação não oferece exclusão', async () => {
    const asset = await addAsset(
      {
        name: 'Moto',
        type: 'veiculo',
        value: 1000000,
        acquisitionValue: null,
        acquisitionDate: null,
        notes: '',
        archived: false,
      },
      '2026-08-01',
    );
    renderWithProviders(
      <RevalueModal asset={asset} history={await history(asset.id)} today={TODAY} onClose={vi.fn()} />,
    );
    await screen.findByRole('dialog', { name: 'Atualizar valor: Moto' });
    expect(screen.queryByRole('button', { name: /Excluir avaliação/ })).not.toBeInTheDocument();
  });
});
