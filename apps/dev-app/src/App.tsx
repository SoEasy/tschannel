import { Component } from 'solid-js';
import { Router, Route, A, useLocation, type RouteSectionProps } from '@solidjs/router';
import PubSubDemo from './pages/PubSubDemo';
import IframeDemo from './pages/IframeDemo';
import './styles.css';

const ChannelSwitcher: Component = () => {
  const location = useLocation();
  const currentPath = () => location.pathname;

  return (
    <div class="channel-switcher">
      <A href="/" class={`channel-tab ${currentPath() === '/' ? 'active' : ''}`}>
        📡 PubSub Channel
      </A>
      <A
        href="/iframe-channel"
        class={`channel-tab ${currentPath() === '/iframe-channel' ? 'active' : ''}`}
      >
        🪟 Iframe Channel
      </A>
    </div>
  );
};

const Layout: Component<RouteSectionProps> = (props) => {
  const location = useLocation();

  const getDescription = () => {
    switch (location.pathname) {
      case '/':
        return 'Testing PubSubChannel with two Bridges in same context';
      case '/iframe-channel':
        return 'Testing IframeChannel with parent-child iframe communication';
      default:
        return '';
    }
  };

  return (
    <div class="app">
      <header>
        <h1>🌉 Bridge-Kit Dev App</h1>
        <p>{getDescription()}</p>
        <ChannelSwitcher />
      </header>
      {props.children}
    </div>
  );
};

const App: Component = () => {
  return (
    <Router root={Layout}>
      <Route path="/" component={PubSubDemo} />
      <Route path="/iframe-channel" component={IframeDemo} />
    </Router>
  );
};

export default App;
