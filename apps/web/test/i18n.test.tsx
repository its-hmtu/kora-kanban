import { screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from './i18n';

function Name() {
  const { t } = useTranslation();
  return <p>{t('app.name')}</p>;
}

describe('renderWithI18n', () => {
  it('renders translated text synchronously, without Suspense or network', () => {
    renderWithI18n(<Name />);
    expect(screen.getByText('Kora')).toBeInTheDocument();
  });
});
