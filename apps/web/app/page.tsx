export default function Home() {
  try {
    // Redirigir temporalmente al dashboard o login, como lo tengas en local
    return (
      <main>
        <h1>Debug NOA Lead Finder</h1>
        <p>Home temporal para depurar error de producción.</p>
      </main>
    );
  } catch (err) {
    console.error('ERROR HOME PAGE:', err);
    return (
      <main>
        <h1>Error en Home</h1>
        <pre>{String(err)}</pre>
      </main>
    );
  }
}
