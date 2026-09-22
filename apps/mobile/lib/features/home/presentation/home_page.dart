import 'package:flutter/material.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Commerce'),
      ),
      body: const Center(
        child: Text(
          'Your marketplace starts here.',
          style: TextStyle(fontSize: 18),
        ),
      ),
    );
  }
}
