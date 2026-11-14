import { registerRootComponent } from 'expo';

// First, so Android can run the background resend with no screen open.
import './src/lib/background';
import { App } from './src/App';

registerRootComponent(App);
