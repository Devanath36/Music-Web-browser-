import { audioEngine } from '../audio/audioEngine';

export interface AudioOutputDeviceOption {
  deviceId: string;
  label: string;
  kind: 'audiooutput';
}

export async function listAudioOutputDevices(): Promise<{
  supported: boolean;
  devices: AudioOutputDeviceOption[];
  warning: string | null;
}> {
  const sinkSupported = audioEngine.isOutputDeviceSelectionSupported();

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return {
      supported: false,
      devices: [],
      warning:
        'Browser MediaDevices API unavailable in this environment. System default audio output is used.',
    };
  }

  try {
    const raw = await navigator.mediaDevices.enumerateDevices();
    const outputs = raw
      .filter((d) => d.kind === 'audiooutput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || (d.deviceId === 'default' ? 'System Default Output' : `Audio Output ${index + 1}`),
        kind: 'audiooutput' as const,
      }));

    if (!sinkSupported) {
      return {
        supported: false,
        devices: outputs,
        warning:
          'This browser controls audio routing at the OS level (setSinkId unsupported). Use device Bluetooth/system settings to switch speakers.',
      };
    }

    return {
      supported: true,
      devices: outputs,
      warning:
        outputs.length === 0
          ? 'No audio output devices reported yet. Play audio or grant media permission if device names appear generic.'
          : null,
    };
  } catch {
    return {
      supported: false,
      devices: [],
      warning: 'Could not enumerate browser audio output devices.',
    };
  }
}
