import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@material-ui/core/styles';
import { Theme as theme, Utils } from '@iobroker/adapter-react-v5';
import App from './app';

let themeName = Utils.getThemeName();

const container = document.getElementById('root');
const root = createRoot(container);

function build() {
	root.render(
		<ThemeProvider theme={theme(themeName)}>
			<App
				adapterName="rockwell-enip"
				onThemeChange={_theme => {
					themeName = _theme;
					build();
				}}
			/>
		</ThemeProvider>
	);
}

build();
