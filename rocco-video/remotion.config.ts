import {Config} from '@remotion/cli/config';

// Neste ambiente o download do Chrome do Remotion é bloqueado: usa o do Playwright.
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? null);
Config.setVideoImageFormat('jpeg');
