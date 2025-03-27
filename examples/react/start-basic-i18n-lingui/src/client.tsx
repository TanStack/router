/// <reference types="vinxi/types/client" />
import { i18n } from "@lingui/core";
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { dynamicActivate } from "./modules/lingui/i18n";
import { createRouter } from './router'

// The lang should be set by the server
dynamicActivate(document.documentElement.lang);

const router = createRouter({ i18n })

hydrateRoot(document, <StartClient router={router} />)
