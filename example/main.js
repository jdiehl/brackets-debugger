(function () {
  'use strict';

  var content = document.getElementById('content'),
    button = document.getElementById('button'),
    clicked = 0;

  button.addEventListener('click', function () {
    clicked += 1;
    content.innerHTML = 'Clicked ' + clicked + ' times';
  });


}());
