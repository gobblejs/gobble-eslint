var path = require( 'path' );
var chalk = require( 'chalk' );
var linter = require( 'eslint' ).linter;
var sander = require( 'sander' );
var promiseMapSeries = require( 'promise-map-series' );
var findup = require( 'findup-sync' );
var sorcery = require( 'sorcery' );
var logSyntaxError = require( 'log-syntax-error' );

var eslintrc = findup( '.eslintrc' );
var defaultOptions;

if ( eslintrc ) {
	try {
		defaultOptions = JSON.parse( require( 'fs' ).readFileSync( eslintrc ) );
	} catch ( err ) {
		throw new Error( 'Could not parse .eslintrc file. It must be valid JSON' );
	}
}

module.exports = function eslint ( inputdir, options ) {
	var log = this.log;

	var reportOnly = options.reportOnly;
	var reporter = options.reporter || defaultReporter;

	delete options.reporter;
	delete options.reportOnly;

	if ( !Object.keys( options ).length ) {
		options = defaultOptions;
	}

	var reports = [];

	return sander.lsr( inputdir ).then( function ( files ) {
		return promiseMapSeries( files.filter( isJs ), function ( file ) {
			var filename = path.join( inputdir, file );

			return sander.readFile( filename )
				.then( String )
				.then( function ( code ) {
					log( 'linting ' + file );
					var messages = linter.verify( code, options, filename );

					if ( messages.length ) {
						reports.push({
							filename: filename,
							messages: messages.sort( bySeverity )
						});
					}
				});
		});
	}).then( function () {
		if ( reports.length ) {
			reporter( reports );

			if ( !reportOnly ) {
				throw new Error( 'Linting failed' );
			}
		}
	});
};

function isJs ( file ) {
	return /\.js$/.test( file );
}

function bySeverity ( a, b ) {
	return b.severity - a.severity;
}

function defaultReporter ( reports ) {
	reports.forEach( function ( report ) {
		var numErrors = report.messages.length;
		var chain = sorcery.loadSync( report.filename );

		var source = sander.readFileSync( report.filename ).toString();

		console.log( '===\n\n%s %s in %s', numErrors, numErrors === 1 ? 'error' : 'errors', report.filename );

		report.messages.forEach( function ( message ) {
			var block, originalLocation, originalSource;

			console.log( '\n---\n' );

			console.log( message.message );
			block = logSyntaxError( source, message.line, message.column );
			console.log( block );

			if ( chain ) {
				originalLocation = chain.trace( message.line, message.column );

				if ( originalLocation ) {
					originalSource = sander.readFileSync( originalLocation.source ).toString();

					console.log( '\noriginal source: ' + originalLocation.source );
					block = logSyntaxError( originalSource, originalLocation.line, originalLocation.column );
					console.log( block );
				}
			}
		});
	});

	console.log( '\n\n' );
}