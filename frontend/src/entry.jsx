if (window.location.pathname === '/app' || window.location.pathname === '/app/') {
  import('./main.jsx');
} else {
  import('./landing.jsx');
}
