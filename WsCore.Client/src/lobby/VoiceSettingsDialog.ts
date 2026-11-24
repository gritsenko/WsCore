import { el } from './LobbyUI';
import type { VoiceDevice, VoiceDevices } from '../voice/VoiceChat';

/** What the voice settings show. */
export interface VoiceSettingsView {
  /** null = still being listed. */
  devices: VoiceDevices | null;
  inputId: string;
  outputId: string;
  /** In a voice channel: a new microphone is switched to at once. */
  inVoice: boolean;
}

export interface VoiceSettingsHandlers {
  onInput(deviceId: string): void;
  onOutput(deviceId: string): void;
  /** Let the browser name the devices (asks for the microphone once). */
  onAllow(): void;
  onTestSound(): void;
  onClose(): void;
}

/** The part of the dialog a status line belongs to. */
export type VoiceSettingsSection = 'input' | 'output';

/**
 * Voice settings, Discord-style: which microphone to talk through and which output
 * the others are heard on. Purely presentational, like ProfileDialog: VoiceChat does
 * the switching and remembers the choice.
 */
export default class VoiceSettingsDialog {
  private readonly overlay: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private view: VoiceSettingsView;
  private readonly statusLines = new Map<VoiceSettingsSection, HTMLDivElement>();
  private readonly statusText = new Map<VoiceSettingsSection, [string, boolean]>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.handlers.onClose();
  };

  constructor(
    view: VoiceSettingsView,
    private readonly handlers: VoiceSettingsHandlers
  ) {
    this.view = view;
    this.overlay = el('div', 'lobby-dialog-overlay');
    this.overlay.onpointerdown = e => {
      if (e.target === this.overlay) handlers.onClose();
    };

    const dialog = el('div', 'lobby-dialog lobby-voice-settings');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Настройки голоса');
    this.overlay.appendChild(dialog);

    const header = el('div', 'lobby-dialog-header');
    header.appendChild(el('span', 'lobby-dialog-title', 'Настройки голоса'));
    const close = el('button', 'lobby-dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.onclick = () => handlers.onClose();
    header.appendChild(close);
    dialog.appendChild(header);

    this.body = el('div', 'lobby-voice-settings-body');
    dialog.appendChild(this.body);

    this.render();
    (document.getElementById('lobby-container') ?? document.body).appendChild(this.overlay);
    document.addEventListener('keydown', this.onKeyDown);
  }

  update(view: VoiceSettingsView): void {
    this.view = view;
    this.render();
  }

  /** The outcome of a choice, under its list ('' hides it). */
  showStatus(section: VoiceSettingsSection, text: string, isError = false): void {
    this.statusText.set(section, [text, isError]);
    const line = this.statusLines.get(section);
    if (line) this.fillStatus(line, section);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.overlay.remove();
  }

  private render(): void {
    const { devices, inputId, outputId, inVoice } = this.view;
    this.statusLines.clear();
    if (!devices) {
      this.body.replaceChildren(el('div', 'lobby-dialog-hint', 'Ищем устройства…'));
      return;
    }

    const parts: HTMLElement[] = [];
    if (!devices.labelsKnown) {
      const allow = el('button', 'lobby-dialog-button lobby-dialog-button-primary', 'Разрешить');
      allow.type = 'button';
      allow.id = 'lobby-voice-allow';
      allow.onclick = () => this.handlers.onAllow();
      const row = el('div', 'lobby-dialog-buttons');
      row.appendChild(allow);
      parts.push(
        el(
          'div',
          'lobby-dialog-hint',
          'Браузер покажет названия устройств, когда вы разрешите доступ к микрофону.'
        ),
        row
      );
    }

    parts.push(
      ...this.picker('input', 'Микрофон', 'lobby-voice-input', devices.inputs, inputId, id =>
        this.handlers.onInput(id)
      ),
      el(
        'div',
        'lobby-dialog-hint',
        inVoice
          ? 'Переключится сразу, без отключения от канала.'
          : 'Будет использован при следующем подключении к голосовому каналу.'
      )
    );

    if (devices.outputSelectable) {
      parts.push(
        ...this.picker('output', 'Динамики', 'lobby-voice-output', devices.outputs, outputId, id =>
          this.handlers.onOutput(id)
        )
      );
    } else {
      parts.push(
        el('label', 'lobby-dialog-label', 'Динамики'),
        el(
          'div',
          'lobby-dialog-hint',
          'Этот браузер не умеет выбирать устройство вывода — звук идёт туда, куда выбрано в системе.'
        )
      );
    }
    const test = el('button', 'lobby-dialog-button', 'Проверить звук');
    test.type = 'button';
    test.id = 'lobby-voice-test';
    test.onclick = () => this.handlers.onTestSound();
    const row = el('div', 'lobby-dialog-buttons');
    row.appendChild(test);
    parts.push(row);

    this.body.replaceChildren(...parts);
  }

  private picker(
    section: VoiceSettingsSection,
    label: string,
    id: string,
    list: VoiceDevice[],
    selected: string,
    onChange: (deviceId: string) => void
  ): HTMLElement[] {
    const title = el('label', 'lobby-dialog-label', label);
    title.htmlFor = id;
    const select = el('select', 'lobby-dialog-input lobby-channel-select');
    select.id = id;
    const options: VoiceDevice[] = [{ id: '', label: 'По умолчанию (как в системе)' }, ...list];
    // A remembered device that is unplugged now: still shown as the choice.
    if (selected && !list.some(d => d.id === selected))
      options.push({ id: selected, label: 'Выбранное устройство (не подключено)' });
    for (const device of options) {
      const option = el('option', undefined, device.label);
      option.value = device.id;
      select.appendChild(option);
    }
    select.value = selected;
    select.onchange = () => onChange(select.value);
    const status = el('div', 'lobby-dialog-status');
    this.statusLines.set(section, status);
    this.fillStatus(status, section);
    return [title, select, status];
  }

  private fillStatus(line: HTMLDivElement, section: VoiceSettingsSection): void {
    const [text, isError] = this.statusText.get(section) ?? ['', false];
    line.textContent = text;
    line.hidden = !text;
    line.classList.toggle('lobby-dialog-status-error', isError);
  }
}
