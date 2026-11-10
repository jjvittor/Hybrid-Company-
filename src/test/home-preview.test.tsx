import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '@/routes/index';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  Link: ({ to, ...props }: ComponentProps<'a'> & { to: string }) => <a href={to} {...props} />,
}));

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Home = Route.options.component!;

describe('Prévia da home', () => {
  it('abre o menu no primeiro clique e devolve o foco ao fechar com Escape', () => {
    render(<Home />);
    const menu = within(screen.getByRole('navigation', { name: 'Menu principal' }));
    const trigger = menu.getByRole('button', { name: /Comprar tudo/ });

    fireEvent.mouseOver(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const category = screen.getByRole('button', { name: 'Camisetas' });
    category.focus();
    fireEvent.keyDown(category, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('abre o menu de celular com acesso à conta', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
  });

  it('busca uma peça, escolhe tamanho e remove o item da sacola de demonstração', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar produtos' }), {
      target: { value: 'heavy' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Camiseta Heavy Box/ }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Tamanho' }), { target: { value: 'G' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à sacola' }));

    const bag = within(screen.getByRole('dialog', { name: 'Sua sacola' }));
    expect(bag.getByText(/Tamanho G/)).toBeInTheDocument();
    expect(bag.getByText(/Pedidos e pagamentos ainda não estão disponíveis/)).toBeInTheDocument();
    fireEvent.click(bag.getByRole('button', { name: /Remover Camiseta/ }));
    expect(bag.getByText('Sua sacola está vazia.')).toBeInTheDocument();
  });

  it('abre a política de privacidade sem enviar o formulário preenchido', () => {
    render(<Home />);
    const footer = within(screen.getByRole('contentinfo'));
    fireEvent.change(footer.getByRole('textbox', { name: 'Seu e-mail' }), {
      target: { value: 'teste@example.com' },
    });
    fireEvent.click(footer.getByRole('checkbox'));
    fireEvent.click(footer.getByRole('button', { name: 'política de privacidade' }));

    expect(screen.getByRole('dialog', { name: 'Privacidade' })).toBeInTheDocument();
    expect(footer.queryByRole('status')).not.toBeInTheDocument();
  });
});
