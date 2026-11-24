// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LobbyBrowserModal } from '../LobbyBrowserModal';
import { LobbyManager } from '../../../../matchmaking/engine/LobbyManager';

describe('Spec 08 - LobbyBrowserModal Component (RF-06, RF-07, US08-P04, US08-P05)', () => {
  let lobbyManager: LobbyManager;

  beforeEach(() => {
    lobbyManager = new LobbyManager();
  });

  it('renders modal with tabs and empty message when no lobbies exist', () => {
    render(
      <LobbyBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        userId="user_1"
        displayName="Alice"
        lobbyManager={lobbyManager}
      />
    );

    expect(screen.getByTestId('lobby-browser-modal')).toBeDefined();
    expect(screen.getByText(/Saguão de Lobbies da Comunidade/i)).toBeDefined();
    expect(screen.getByTestId('tab-browse-lobbies')).toBeDefined();
    expect(screen.getByTestId('tab-create-lobby')).toBeDefined();
    expect(screen.getByTestId('tab-join-code')).toBeDefined();
    expect(screen.getByTestId('empty-lobbies-message')).toBeDefined();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <LobbyBrowserModal
        isOpen={false}
        onClose={vi.fn()}
        userId="user_1"
        displayName="Alice"
        lobbyManager={lobbyManager}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('lists public lobbies and allows joining from list (RF-07, US08-P04)', () => {
    // Seed lobby
    const created = lobbyManager.createLobby({
      hostId: 'host_alice',
      hostName: 'Alice',
      title: 'Arena Blitz dos Mestres',
      variantId: 'standard',
      maxPlayers: 2,
    });

    const onJoinSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <LobbyBrowserModal
        isOpen={true}
        onClose={onClose}
        userId="user_bob"
        displayName="Bob"
        lobbyManager={lobbyManager}
        onJoinLobbySuccess={onJoinSuccess}
      />
    );

    expect(screen.getByText('Arena Blitz dos Mestres')).toBeDefined();
    expect(screen.getByText(created.joinCode)).toBeDefined();

    const joinBtn = screen.getByText('Entrar');
    fireEvent.click(joinBtn);

    expect(onJoinSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('allows creating a new lobby and notifies on success (RF-06, US08-P05)', () => {
    const onJoinSuccess = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
      <LobbyBrowserModal
        isOpen={true}
        onClose={onClose}
        userId="user_host"
        displayName="Carlos"
        lobbyManager={lobbyManager}
        onJoinLobbySuccess={onJoinSuccess}
      />
    );

    // Switch to create tab
    fireEvent.click(screen.getByTestId('tab-create-lobby'));

    // Fill form
    const titleInput = screen.getByTestId('input-create-title');
    fireEvent.change(titleInput, { target: { value: 'Meu Torneio Hexagonal' } });

    const submitBtn = container.querySelector('#btn-submit-create-lobby') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    expect(onJoinSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Meu Torneio Hexagonal',
        hostName: 'Carlos',
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('allows joining via 6-character code (US08-P05)', () => {
    const created = lobbyManager.createLobby({
      hostId: 'host_code',
      hostName: 'Diana',
      title: 'Sala Privada Código',
      variantId: 'duck',
      maxPlayers: 2,
    });

    const onJoinSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <LobbyBrowserModal
        isOpen={true}
        onClose={onClose}
        userId="user_joiner"
        displayName="Eduardo"
        lobbyManager={lobbyManager}
        onJoinLobbySuccess={onJoinSuccess}
      />
    );

    // Switch to code tab
    fireEvent.click(screen.getByTestId('tab-join-code'));

    const codeInput = screen.getByTestId('input-join-code');
    fireEvent.change(codeInput, { target: { value: created.joinCode } });

    const joinBtn = screen.getByText('Entrar na Sala');
    fireEvent.click(joinBtn);

    expect(onJoinSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        lobbyId: created.lobbyId,
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error notification when joining with invalid code', () => {
    render(
      <LobbyBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        userId="user_err"
        displayName="Fabio"
        lobbyManager={lobbyManager}
      />
    );

    fireEvent.click(screen.getByTestId('tab-join-code'));

    const codeInput = screen.getByTestId('input-join-code');
    fireEvent.change(codeInput, { target: { value: 'INVALID_CODE' } });

    fireEvent.click(screen.getByText('Entrar na Sala'));

    expect(screen.getByTestId('lobby-error-alert').textContent).toMatch(/Sala não encontrada/i);
  });
});
