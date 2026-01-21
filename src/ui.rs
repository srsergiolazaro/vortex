use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::time::Duration;

pub struct Spinner {
    pb: ProgressBar,
}

impl Spinner {
    pub fn new(msg: &str) -> Self {
        let pb = ProgressBar::new_spinner();
        pb.enable_steady_tick(Duration::from_millis(100));
        pb.set_style(
            ProgressStyle::with_template("{spinner:.cyan} {msg}")
                .unwrap()
                .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
        );
        pb.set_message(msg.to_string());
        Self { pb }
    }

    pub fn update(&self, msg: &str) {
        self.pb.set_message(msg.to_string());
    }

    pub fn succeed(&self, msg: &str) {
        self.pb.finish_with_message(format!("{} {}", "✔".green(), msg));
    }

    pub fn fail(&self, msg: &str) {
        self.pb.finish_with_message(format!("{} {}", "✖".red(), msg));
    }
}

pub fn info(msg: &str) {
    println!("{} {}", "ℹ".blue(), msg);
}

pub fn error(msg: &str) {
    eprintln!("{} {}", "✖".red(), msg);
}
