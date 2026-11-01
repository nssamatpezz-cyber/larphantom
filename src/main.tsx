import React from 'react'; import {createRoot} from 'react-dom/client'; import './styles.css'; import './styles-extra.css'; import './styles-reference.css'; import './styles-mobile.css'; import './styles-screenshot-reference.css'; import './styles-flows.css'; import App from './App';
import './pwa';
import LaunchScreen from './LaunchScreen';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/><LaunchScreen/></React.StrictMode>);
