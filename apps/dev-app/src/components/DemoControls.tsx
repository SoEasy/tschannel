import { Component, createSignal, Show } from 'solid-js';
import type { Bridge } from '@tschannel/core';
import { send } from '../namespace';
import type { demoNamespace } from '../namespace';
import { LogService } from '../middlewares/log/log.service';

type Props = {
  bridge: Bridge<typeof demoNamespace, any>;
  bridgeB?: Bridge<typeof demoNamespace, any>;
  channelName: string;
  logService: LogService;
};

const DemoControls: Component<Props> = (props) => {
  const [textInput, setTextInput] = createSignal('');
  const [numberInput, setNumberInput] = createSignal('');
  const [userIdInput, setUserIdInput] = createSignal('');

  const addLog = (side: 'Main' | 'Worker', type: 'sent' | 'received', message: string) => {
    props.logService.addMessage({ side, type, message });
  };

  // Send text message from Main to Worker
  const handleSendText = async () => {
    const text = textInput();
    if (!text) return;

    try {
      addLog('Main', 'sent', `sendText: "${text}"`);
      const response = await props.bridge.dispatch(send.sendText(text));
      addLog('Main', 'received', `Response: "${response}"`);
      setTextInput('');
    } catch (error) {
      addLog('Main', 'received', `Error: ${error}`);
    }
  };

  // Calculate square from Main to Worker
  const handleCalculateSquare = async () => {
    const num = parseFloat(numberInput());
    if (isNaN(num)) return;

    try {
      addLog('Main', 'sent', `calculateSquare: ${num}`);
      const response = await props.bridge.dispatch(send.calculateSquare(num));
      addLog('Main', 'received', `Result: ${response}`);
      setNumberInput('');
    } catch (error) {
      addLog('Main', 'received', `Error: ${error}`);
    }
  };

  // Get user data from Main to Worker
  const handleGetUserData = async () => {
    const id = userIdInput();
    if (!id) return;

    try {
      addLog('Main', 'sent', `getUserData: { id: "${id}" }`);
      const response = await props.bridge.dispatch(send.getUserData({ id }));
      addLog('Main', 'received', `User: ${JSON.stringify(response)}`);
      setUserIdInput('');
    } catch (error) {
      addLog('Main', 'received', `Error: ${error}`);
    }
  };

  // Main → Worker: Ping from Main to Worker
  const handlePing = async () => {
    try {
      addLog('Main', 'sent', 'ping to Worker');
      const response = await props.bridge.dispatch(send.ping());
      addLog('Main', 'received', `Response: "${response}"`);
    } catch (error) {
      addLog('Main', 'received', `Error: ${error}`);
    }
  };

  // Worker → Main: Notify from Worker to Main
  const handleNotify = async () => {
    if (!props.bridgeB) return;
    try {
      addLog('Worker', 'sent', 'notifyParent to Main');
      await props.bridgeB.dispatch(
        send.notifyParent(`Event at ${new Date().toLocaleTimeString()}`)
      );
      addLog('Worker', 'sent', 'Notification sent (no response expected)');
    } catch (error) {
      addLog('Worker', 'sent', `Error: ${error}`);
    }
  };

  // Worker → Main: Log from Worker to Main
  const handleLog = async () => {
    if (!props.bridgeB) return;
    try {
      addLog('Worker', 'sent', 'logToParent to Main');
      await props.bridgeB.dispatch(
        send.logToParent({
          level: 'info',
          message: `Worker event at ${new Date().toLocaleTimeString()}`,
        })
      );
      addLog('Worker', 'sent', 'Log sent (no response expected)');
    } catch (error) {
      addLog('Worker', 'sent', `Error: ${error}`);
    }
  };

  // Bidirectional: Echo from Worker to Main
  const handleEcho = async () => {
    if (!props.bridgeB) return;
    try {
      addLog('Worker', 'sent', 'echo to Main: "Hello from Worker"');
      const response = await props.bridgeB.dispatch(send.echo('Hello from Worker'));
      addLog('Worker', 'received', `Response: "${response}"`);
    } catch (error) {
      addLog('Worker', 'received', `Error: ${error}`);
    }
  };

  // Bidirectional: Ping from Worker to Main
  const handlePingBack = async () => {
    if (!props.bridgeB) return;
    try {
      addLog('Worker', 'sent', 'ping to Main');
      const response = await props.bridgeB.dispatch(send.ping());
      addLog('Worker', 'received', `Response: "${response}"`);
    } catch (error) {
      addLog('Worker', 'received', `Error: ${error}`);
    }
  };

  return (
    <>
      <div class="container">
        <div class="side side-a">
          <h2>Side A (Main)</h2>
          <div class="controls">
            <div class="control-group">
              <h3>Send Text</h3>
              <input
                type="text"
                placeholder="Enter text..."
                value={textInput()}
                onInput={(e) => setTextInput(e.currentTarget.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
              />
              <button onClick={handleSendText}>Send Text</button>
            </div>

            <div class="control-group">
              <h3>Calculate Square</h3>
              <input
                type="number"
                placeholder="Enter number..."
                value={numberInput()}
                onInput={(e) => setNumberInput(e.currentTarget.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCalculateSquare()}
              />
              <button onClick={handleCalculateSquare}>Calculate</button>
            </div>

            <div class="control-group">
              <h3>Get User Data</h3>
              <input
                type="text"
                placeholder="User ID..."
                value={userIdInput()}
                onInput={(e) => setUserIdInput(e.currentTarget.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGetUserData()}
              />
              <button onClick={handleGetUserData}>Get User</button>
            </div>

            <div class="control-group">
              <h3>Ping</h3>
              <button onClick={handlePing}>Ping →</button>
            </div>
          </div>
        </div>

        <div class="side side-b">
          <h2>Side B (Worker)</h2>
          <div class="handlers">
            <h3>Main → Worker Handlers:</h3>
            <ul>
              <li>
                <code>sendText</code>: string → string
              </li>
              <li>
                <code>calculateSquare</code>: number → number
              </li>
              <li>
                <code>getUserData</code>: {'{id}'} → User
              </li>
            </ul>
          </div>

          <Show when={props.bridgeB}>
            <div class="controls">
              <div class="control-group">
                <h3>Worker → Main</h3>
                <button onClick={handleNotify}>Notify Parent</button>
                <button onClick={handleLog}>Send Log</button>
              </div>

              <div class="control-group">
                <h3>Bidirectional</h3>
                <button onClick={handleEcho}>Echo to A</button>
                <button onClick={handlePingBack}>Ping A</button>
              </div>
            </div>
          </Show>

          <Show when={!props.bridgeB}>
            <div class="handlers">
              <p style={{ opacity: 0.7, 'font-style': 'italic', 'margin-top': '20px' }}>
                Worker actions available in iframe below
              </p>
            </div>
          </Show>
        </div>
      </div>
    </>
  );
};

export default DemoControls;
